// 고양이 · 보물상자 · 정거장 · 플래그 · 시체 · 지상의 집
import {
  TILE, ZOOM, CHUNK, CHEST_GRADES, POTION, M_PER_TILE, FLAG,
  CHEST_DENSITY, CAT_DENSITY, CAT_CARRY_MAX, CAT_BASE_REWARD, CAT_BATCH_BONUS, DRILL_CHARGE_MAX,
  ITEM_DROP_WEIGHTS, POTION_DROP_CHANCE,
} from '../data/balance.js';
import { hash2, mulberry32 } from '../world/rng.js';
import { MAT, pack, isDiggable } from '../world/tiles.js';
import { fetchMarkers, lootCorpse as lootCorpseApi } from '../net/api.js';

export const HOUSE = { x0: 3, y0: -5, x1: 11, y1: -1, doorX: 7 };
// 지상 스폰/복귀 지점 = 집 문 앞. 집 주변 지상 타일(x 2~13, y 0~1)은 파괴 불가라
// 엘리베이터로 올라올 때 자기가 파 놓은 갱도로 떨어지는 일이 없다.
// 굴착은 집에서 왼쪽으로 걸어 나온 x ≤ 1에서 시작한다.
export const SURFACE_SPAWN = { x: HOUSE.doorX, y: -3 };
const ITEM_KIND_ENTRIES = Object.entries(ITEM_DROP_WEIGHTS);
const ITEM_WEIGHT_TOTAL = ITEM_KIND_ENTRIES.reduce((s, [, w]) => s + w, 0);
/** 가중치대로 아이템 종류를 뽑는다 — 폭탄·드릴·레이저가 플래그보다 잘 나온다 */
function pickWeightedItem(rnd) {
  let r = rnd() * ITEM_WEIGHT_TOTAL;
  for (const [k, w] of ITEM_KIND_ENTRIES) { r -= w; if (r <= 0) return k; }
  return ITEM_KIND_ENTRIES[0][0];
}
const INTERACT_R = 2.5; // 타일 — 상자·고양이·플래그·시체 공통 사거리
const DROP_G = 620;     // px/s² — 발밑이 사라진 상자·고양이의 낙하 가속
const DROP_MAX_V = 260; // px/s

// 순수 장식용 — 점수·능력에는 아무 차이가 없다 (§5-4)
export const CAT_BREEDS = [
  { name: '까망이', body: '#2b2b2f', accent: '#1a1a1d' },
  { name: '치즈', body: '#e8a33d', accent: '#c97f22' },
  { name: '흰둥이', body: '#f2efe6', accent: '#cfc8b6' },
  { name: '고등어', body: '#7c8494', accent: '#4c525e' },
  { name: '회색이', body: '#9a9aa0', accent: '#6d6d74' },
];

export class Objects {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.chests = [];
    this.cats = [];
    this.stations = [];
    this.flags = [];
    this.corpses = [];
    this.spawned = new Set();
    this.nextId = 1;
    this.readFlags = new Set();
  }

  id(p) { return p + this.nextId++; }

  ensureChunk(cx, cy) {
    const key = cx + ',' + cy;
    if (this.spawned.has(key)) return;
    this.spawned.add(key);
    const world = this.game.world;
    const gen = world.gen;

    // 정거장
    for (const s of gen.stations) {
      if (Math.floor(s.y / CHUNK) !== cy) continue;
      if (Math.floor(s.x / CHUNK) !== cx) continue;
      // 같은 깊이에 여러 대가 있으므로 index가 아니라 개별 id로 중복을 판단한다
      const id = 'S' + s.index + ':' + s.sub;
      if (this.stations.some((t) => t.id === id)) continue;
      this.stations.push({
        id, index: s.index, sub: s.sub, x: s.x, y: s.y,
        depthM: s.depthM, discovered: false, cats: 0,
      });
    }

    if (cy < 0) return;

    const rnd = mulberry32((cx * 40503) ^ (cy * 90001) ^ (gen.seed + 5));

    // 보물상자 — 밀도 · 등급은 주변 최대 경도로 게이트 (§5-7)
    if (rnd() < CHEST_DENSITY) {
      for (let t = 0; t < 30; t++) {
        const tx = cx * CHUNK + Math.floor(rnd() * CHUNK);
        const ty = cy * CHUNK + Math.floor(rnd() * CHUNK);
        if (!this.buriable(tx, ty)) continue;
        const grade = this.rollChestGrade(gen.maxHardnessAround(tx, ty, 3), rnd);
        this.chests.push({ id: this.id('C'), x: tx, y: ty, grade, opened: false });
        this.hollow(tx, ty);
        break;
      }
    }

    // 고양이 — 상자와 같은 방식, 밀도는 80% (§5-4)
    if (rnd() < CAT_DENSITY) {
      for (let t = 0; t < 30; t++) {
        const tx = cx * CHUNK + Math.floor(rnd() * CHUNK);
        const ty = cy * CHUNK + Math.floor(rnd() * CHUNK);
        if (!this.buriable(tx, ty)) continue;
        const breed = Math.floor(rnd() * CAT_BREEDS.length);
        this.cats.push({ id: this.id('K'), x: tx, y: ty, carried: false, breed });
        this.hollow(tx, ty);
        break;
      }
    }
  }

  /**
   * 대상이 들어앉을 1타일 공간을 비운다. 사방은 암반이라 파내야 닿고,
   * 발밑 암반을 파내면 대상이 아래로 떨어진다 (updateDrops).
   */
  hollow(tx, ty) {
    this.game.world.set(tx, ty, 0);
  }

  /** 발밑이 사라지면 상자·고양이도 떨어진다 */
  updateDrops(dt) {
    const world = this.game.world;
    const fall = (o) => {
      if (world.isSolid(o.x, o.y + 1)) {
        if (o.oy) { o.oy = 0; o.vy = 0; }
        return;
      }
      o.vy = Math.min((o.vy || 0) + DROP_G * dt, DROP_MAX_V);
      o.oy = (o.oy || 0) + o.vy * dt;
      while (o.oy >= TILE) {
        o.oy -= TILE;
        o.y += 1;
        if (world.isSolid(o.x, o.y + 1)) { o.oy = 0; o.vy = 0; return; }
      }
    };
    for (const c of this.chests) if (!c.opened) fall(c);
    for (const c of this.cats) if (!c.carried) fall(c);
  }

  /**
   * 파묻힐 수 있는 자리인가 — 자기 타일이 캘 수 있는 암반이고 사방이 막혀 있어야 한다.
   * 공동에 노출된 자리를 걸러내서 "걸어가다 줍는" 배치가 되지 않게 한다 (§5-7).
   * 타일은 비우지 않는다. blocksTile()이 대상이 든 타일을 파괴 대상에서 제외하므로
   * 플레이어는 주변 암반을 파내 접근하고, 대상이 든 칸은 끝까지 남는다 (§11-2).
   */
  buriable(tx, ty) {
    const world = this.game.world;
    if (!isDiggable(world.mat(tx, ty))) return false;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (!world.isSolid(tx + dx, ty + dy)) return false;
    }
    return true;
  }

  findBuriable(tx, ty) {
    for (let r = 0; r <= 10; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = tx + dx, y = ty + dy;
          if (this.buriable(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  rollChestGrade(maxH, rnd) {
    const ok = CHEST_GRADES.filter((g) => maxH >= g.minH);
    const total = ok.reduce((s, g) => s + g.p, 0);
    let r = rnd() * total;
    for (const g of ok) { r -= g.p; if (r <= 0) return g.grade; }
    return ok[0].grade;
  }

  /**
   * 서버에서 다른 플레이어의 플래그·시체를 받아와 합친다. 이 세션의 지형은
   * 다른 시드로 생성됐을 수 있으니, 마커가 놓인 자리 밑에 보강 발판 3칸을
   * 강제로 깔아 항상 딛고 설 수 있게 한다 (§9).
   */
  async fetchAndApplyMarkers() {
    const data = await fetchMarkers();
    if (!data) return;
    const world = this.game.world;
    const reinforce = (x, y) => {
      world.set(x, y, pack(MAT.AIR));
      for (let dx = -1; dx <= 1; dx++) world.set(x + dx, y + 1, pack(MAT.REINFORCED));
    };
    for (const f of data.flags || []) {
      if (this.flags.some((x) => x.remoteId === f.id)) continue;
      const x = Math.round(f.x), y = Math.round(f.y);
      reinforce(x, y);
      this.flags.push({ id: this.id('F'), remoteId: f.id, x, y, msg: f.msg, level: f.level, owner: f.owner, mine: false });
    }
    for (const c of data.corpses || []) {
      if (this.corpses.some((x) => x.remoteId === c.id)) continue;
      const x = Math.round(c.x), y = Math.round(c.y);
      reinforce(x, y);
      this.corpses.push({ id: this.id('R'), remoteId: c.id, x, y, owner: c.owner, copper: c.copper, cause: c.cause, looted: false });
    }
  }

  /** 파괴 대상에서 제외되는 타일 (§11-2) */
  blocksTile(x, y) {
    for (const c of this.chests) if (!c.opened && c.x === x && c.y === y) return true;
    for (const c of this.cats) if (!c.carried && c.x === x && c.y === y) return true;
    return false;
  }

  targets() {
    const out = [];
    for (const c of this.chests) if (!c.opened) out.push({ id: c.id, x: c.x * TILE + 8, y: c.y * TILE + 8, kind: 'chest', ref: c });
    for (const c of this.cats) if (!c.carried) out.push({ id: c.id, x: c.x * TILE + 8, y: c.y * TILE + 8, kind: 'cat', ref: c });
    for (const s of this.stations) out.push({ id: s.id, x: s.x * TILE + 8, y: s.y * TILE + 8, kind: 'station', ref: s });
    for (const f of this.flags) out.push({ id: f.id, x: f.x * TILE + 8, y: f.y * TILE + 8, kind: 'flag', ref: f });
    for (const c of this.corpses) if (!c.looted) out.push({ id: c.id, x: c.x * TILE + 8, y: c.y * TILE + 8, kind: 'corpse', ref: c });
    return out;
  }

  validIds() {
    const s = new Set();
    for (const c of this.chests) if (!c.opened) s.add(c.id);
    for (const c of this.cats) if (!c.carried) s.add(c.id);
    for (const t of this.stations) s.add(t.id);
    for (const f of this.flags) s.add(f.id);
    for (const c of this.corpses) if (!c.looted) s.add(c.id);
    return s;
  }

  update(dt) {
    const p = this.game.player;
    const pcx = Math.floor(p.cx / TILE / CHUNK), pcy = Math.floor(p.cy / TILE / CHUNK);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.ensureChunk(pcx + dx, pcy + dy);
    this.updateDrops(dt);
    // 근처 정거장은 소나 없이도 발견 — 파고들어 드러난(exposed) 뒤부터
    for (const s of this.stations) {
      if (s.discovered || !this.exposed(s.x, s.y)) continue;
      if (Math.hypot(s.x - p.tileX, s.y - p.tileY) < 10) this.game.discoverStation(s);
    }
  }

  near(tx, ty, x, y, r) { return Math.hypot(tx - x, ty - y) <= r; }

  nearHouse() {
    const p = this.game.player;
    return p.tileX >= HOUSE.x0 - 3 && p.tileX <= HOUSE.x1 + 3 && p.tileY >= HOUSE.y0 - 2 && p.tileY <= 2;
  }

  /**
   * 암반에 가려져 있는가 — 사방이 전부 막혀 있으면 아직 파 들어가지 않은
   * 것이므로 화면에 드러나지 않는다. 소나로 위치만 알 수 있고, 실제로
   * 파고들어야(인접 타일 하나라도 열려야) 눈에 보이고 상호작용도 된다 (§9).
   */
  exposed(tx, ty) {
    const world = this.game.world;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (!world.isSolid(tx + dx, ty + dy)) return true;
    }
    return false;
  }

  nearestStation(r = 6) {
    const p = this.game.player;
    let best = null, bd = r;
    for (const s of this.stations) {
      if (!this.exposed(s.x, s.y)) continue;
      const d = Math.hypot(s.x - p.tileX, s.y - p.tileY);
      if (d <= bd) { bd = d; best = s; }
    }
    return best;
  }

  /**
   * 지금 E가 실제로 집을 대상. 우선순위: 상자 → 고양이 → 플래그 → 시체 → 정거장 → 집.
   * 상자·고양이·플래그·시체가 정거장과 겹쳐 있어도 이쪽을 먼저 집도록,
   * 사거리가 넓은 정거장을 뒤로 미뤘다. interact()와 화면의 [E] 안내가
   * 같은 답을 보게 하려고 한곳에 모았다.
   */
  interactTarget() {
    const p = this.game.player;
    for (const c of this.chests) {
      if (c.opened || !this.exposed(c.x, c.y)) continue;
      if (this.near(c.x, c.y, p.tileX, p.tileY, INTERACT_R)) return { kind: 'chest', ref: c };
    }
    for (const c of this.cats) {
      if (c.carried || !this.exposed(c.x, c.y)) continue;
      if (this.near(c.x, c.y, p.tileX, p.tileY, INTERACT_R)) return { kind: 'cat', ref: c };
    }
    for (const f of this.flags) {
      if (!this.exposed(f.x, f.y)) continue;
      if (this.near(f.x, f.y, p.tileX, p.tileY, INTERACT_R)) return { kind: 'flag', ref: f };
    }
    for (const c of this.corpses) {
      if (c.looted || !this.exposed(c.x, c.y)) continue;
      if (this.near(c.x, c.y, p.tileX, p.tileY, INTERACT_R)) return { kind: 'corpse', ref: c };
    }
    const st = this.nearestStation(6);
    if (st) return { kind: 'station', ref: st };
    if (this.nearHouse()) return { kind: 'house', ref: null };
    return null;
  }

  /** E 상호작용 */
  interact() {
    const g = this.game;
    const t = this.interactTarget();
    if (!t) return null;
    switch (t.kind) {
      case 'station': g.openElevator(t.ref); break;
      case 'house': g.openHouse(); break;
      case 'chest': this.openChest(t.ref); break;
      case 'cat': this.pickCat(t.ref); break;
      case 'flag': g.readFlag(t.ref); break;
      case 'corpse': this.lootCorpse(t.ref); break;
    }
    return t.kind;
  }

  async lootCorpse(c) {
    const g = this.game;
    c.looted = true; // 낙관적으로 즉시 잠금 — 서버가 거절해도 클라에서는 이미 비운 자리다
    const res = c.remoteId ? await lootCorpseApi(c.remoteId) : { ok: true, copper: c.copper };
    const gained = res && res.ok ? (res.copper ?? c.copper) : 0;
    if (gained > 0) {
      g.gainCopper(gained);
      g.sfx.play('pickup');
      g.toast(`${c.owner || '누군가'}의 무덤에서 ${gained}구리를 주웠다`);
    } else {
      g.toast('이미 누가 털어 간 무덤이다');
    }
  }

  openChest(c) {
    const g = this.game;
    c.opened = true;
    const rnd = mulberry32((c.x * 7919) ^ (c.y * 104729) ^ g.world.gen.seed);
    const lines = [];
    const n = c.grade === 3 ? 3 : c.grade === 2 ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const k = pickWeightedItem(rnd); // 폭탄·드릴·레이저가 플래그보다 잘 나온다
      if (k === 'drill') {
        // 드릴은 개수가 아니라 충전(칸) — 레벨별 최대치에서 멈춘다 (§5-2)
        const cap = DRILL_CHARGE_MAX[g.profile.upgrades.drill - 1];
        const before = g.run.items.drill | 0;
        g.run.items.drill = Math.min(cap, before + 1);
        lines.push(`드릴 충전 +${g.run.items.drill - before}`);
        continue;
      }
      const amt = k === 'bomb' ? 2 : 1;
      g.run.items[k] = (g.run.items[k] | 0) + amt;
      lines.push(`${k} +${amt}`);
    }
    if (rnd() < POTION_DROP_CHANCE) { // 포션은 이제 확률 드롭 (§5-4)
      g.run.potions[c.grade] = (g.run.potions[c.grade] | 0) + 1;
      lines.push(`${POTION[c.grade].name} 포션 +1`);
    }
    g.player.heal(1); // 모든 등급이 HP +1 (§5-7)
    lines.push('HP +1');
    g.sfx.play('chest');
    g.particles.spawn(c.x * TILE + 8, c.y * TILE + 8, 12, '#ffd766', { spread: 3, life: 0.6 });
    g.toast(`${CHEST_GRADES[c.grade - 1].name} 상자 — ` + lines.join(' · '), 3200);
  }

  pickCat(c) {
    const g = this.game;
    if (g.run.cats.length >= CAT_CARRY_MAX) { g.toast(`고양이는 동시에 ${CAT_CARRY_MAX}마리까지`); g.sfx.play('error'); return; }
    c.carried = true;
    g.run.cats.push(c);
    g.sfx.play('cat');
    g.toast(`${CAT_BREEDS[c.breed ?? 0].name}를 업었다`);
  }

  /** 집·정거장에서 인계 — 한 번에 많이 데려올수록 마리당 보너스가 붙는다 (§5-4) */
  deliverCats(station) {
    const g = this.game;
    if (g.run.cats.length === 0) return 0;
    const n = g.run.cats.length;
    for (const c of g.run.cats) {
      const i = this.cats.indexOf(c);
      if (i >= 0) this.cats.splice(i, 1);
    }
    g.run.cats = [];
    g.run.catsDelivered += n;
    if (station) station.cats += n;
    const bonus = Math.round(CAT_BASE_REWARD * n * (1 + CAT_BATCH_BONUS * (n - 1)));
    g.gainCopper(bonus);
    g.sfx.play('deliver');
    g.toast(`고양이 ${n}마리 인계 (+${bonus}구리) — 누적 ${g.run.catsDelivered}마리`);
    return n;
  }

  placeFlag(msg) {
    const g = this.game;
    const p = g.player;
    const x = p.tileX, y = Math.floor((p.y + p.h - 1) / TILE);
    if (g.world.mat(x, y) !== MAT.AIR) { g.toast('플래그를 세울 자리가 없다'); g.sfx.play('error'); return null; }
    if ((g.run.items.flag | 0) <= 0) { g.toast('플래그가 없다'); g.sfx.play('error'); return null; }
    g.run.items.flag--;
    const level = g.profile.upgrades.flag;
    const f = { id: this.id('F'), x, y, msg, level, owner: g.profile.name, mine: true };
    this.flags.push(f);
    g.sfx.play('flag');
    g.toast('플래그를 세웠다');
    return f;
  }

  draw(ctx, cam) {
    // E가 지금 누구를 집는지 한 번만 계산해서 안내도 그대로 따라간다
    const target = this.interactTarget();

    // 지상의 집
    const hx = HOUSE.x0 * TILE - cam.x, hy = HOUSE.y0 * TILE - cam.y;
    const hw = (HOUSE.x1 - HOUSE.x0 + 1) * TILE, hh = (HOUSE.y1 - HOUSE.y0 + 1) * TILE;
    ctx.fillStyle = '#8a5a3c';
    ctx.fillRect(hx, hy, hw, hh);
    ctx.fillStyle = '#c0492f';
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy);
    ctx.lineTo(hx + hw / 2, hy - 26);
    ctx.lineTo(hx + hw + 6, hy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a2b20';
    ctx.fillRect(hx + hw / 2 - 9, hy + hh - 26, 18, 26);
    ctx.fillStyle = '#f4d47c';
    ctx.fillRect(hx + 8, hy + 10, 12, 12);
    ctx.fillRect(hx + hw - 20, hy + 10, 12, 12);
    if (target && target.kind === 'house') {
      this.drawPrompt(ctx, hx + hw / 2, hy - 32, '[E] 집');
    }

    // 정거장 — 파고들어 드러나기 전까지는 암반에 가려 보이지 않는다 (§9)
    for (const s of this.stations) {
      if (!this.exposed(s.x, s.y)) continue;
      const x = s.x * TILE - cam.x, y = s.y * TILE - cam.y;
      if (x < -200 || x > cam.w + 200 || y < -200 || y > cam.h + 200) continue;
      ctx.fillStyle = '#b9c2d8';
      ctx.fillRect(x - 20, y - 40, 8, 44);
      ctx.fillRect(x + 12, y - 40, 8, 44);
      ctx.fillStyle = '#8ea0c8';
      ctx.fillRect(x - 20, y - 46, 40, 8);
      ctx.fillStyle = '#2a3348';
      ctx.fillRect(x - 10, y - 34, 20, 32);
      ctx.fillStyle = '#f0e6a0';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`E${s.index}`, x + 4, y - 50);
      ctx.textAlign = 'left';
    }

    // 보물상자 — 파고들어 드러나기 전까지는 암반에 가려 보이지 않는다 (§9)
    for (const c of this.chests) {
      if (c.opened || !this.exposed(c.x, c.y)) continue;
      const x = c.x * TILE - cam.x, y = c.y * TILE + (c.oy || 0) - cam.y;
      const col = c.grade === 3 ? '#f2c437' : c.grade === 2 ? '#7ab8f0' : '#b98a5a';
      ctx.fillStyle = '#4a3524';
      ctx.fillRect(x + 1, y + 5, 14, 11);
      ctx.fillStyle = col;
      ctx.fillRect(x + 1, y + 3, 14, 4);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(x + 7, y + 8, 2, 4);
      // 사거리 안이면 테두리 + [E] 안내 (E를 눌러야 열린다는 걸 알려준다)
      if (target && target.kind === 'chest' && target.ref === c) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 2.5, 15, 14);
        this.drawPrompt(ctx, x + 8, this.promptY(c.y) - cam.y, '[E] 열기');
      }
    }

    // 고양이 — 파고들어 드러나기 전까지는 암반에 가려 보이지 않는다 (§9)
    for (const c of this.cats) {
      if (c.carried || !this.exposed(c.x, c.y)) continue;
      const x = c.x * TILE - cam.x, y = c.y * TILE + (c.oy || 0) - cam.y;
      this.drawCat(ctx, x, y, 1, c.breed);
      if (target && target.kind === 'cat' && target.ref === c) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
        this.drawPrompt(ctx, x + 8, this.promptY(c.y) - cam.y, '[E] 업기');
      }
    }
    // 업고 있는 고양이
    const p = this.game.player;
    this.game.run.cats.forEach((c, i) => {
      this.drawCat(ctx, p.x - cam.x + (i === 0 ? -2 : 6), p.y - cam.y - 12 - i * 3, 0.85, c.breed);
    });

    // 플래그 — 파고들어 드러나기 전까지는 암반에 가려 보이지 않는다 (§9)
    for (const f of this.flags) {
      if (!this.exposed(f.x, f.y)) continue;
      const x = f.x * TILE - cam.x, y = f.y * TILE - cam.y;
      ctx.fillStyle = '#d8d0c0';
      ctx.fillRect(x + 7, y - 6, 2, 22);
      ctx.fillStyle = f.mine ? '#4aa8ff' : '#7ad0ff';
      ctx.beginPath();
      ctx.moveTo(x + 9, y - 6);
      ctx.lineTo(x + 22, y - 1);
      ctx.lineTo(x + 9, y + 4);
      ctx.closePath();
      ctx.fill();
      if (target && target.kind === 'flag' && target.ref === f) {
        this.drawPrompt(ctx, x + 8, this.promptY(f.y, 12) - cam.y, '[E] 읽기');
      }
    }

    // 다른 플레이어의 시체 — 무덤 모양 (§10), 파고들어 드러나기 전까지는 안 보인다 (§9)
    for (const c of this.corpses) {
      if (c.looted || !this.exposed(c.x, c.y)) continue;
      const x = c.x * TILE - cam.x, y = c.y * TILE - cam.y;
      this.drawGrave(ctx, x, y);
      if (target && target.kind === 'corpse' && target.ref === c) {
        this.drawPrompt(ctx, x + 8, this.promptY(c.y, 12) - cam.y, '[E] 뒤지기');
      }
    }
  }

  /**
   * 안내를 놓을 세로 위치. 대상 위에서 파 내려온 경우(플레이어가 더 높을 때)
   * 위에 그리면 라벨이 캐릭터 몸을 덮으므로 아래로 뒤집는다.
   */
  promptY(ty, up = 6) {
    const oy = ty * TILE;
    return this.game.player.cy < oy + TILE / 2 ? oy + TILE + 12 : oy - up;
  }

  /**
   * 어떤 배경 위에서도 읽히게 어두운 판을 깔고 쓰는 [E] 안내.
   * 확대 배율을 벗어나 화면 좌표로 그린다 — 월드 좌표로 두면 3배 확대에서
   * 글자가 36px이 되어 캐릭터를 덮어버린다. 입력은 카메라 상대 좌표.
   */
  drawPrompt(ctx, x, y, text) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sx = x * ZOOM, sy = y * ZOOM;
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 20;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - w / 2, sy - 26, w, 34);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, sx, sy);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  drawCat(ctx, x, y, scale = 1, breed = 0) {
    const b = CAT_BREEDS[breed] || CAT_BREEDS[0];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = b.body;
    ctx.fillRect(2, 6, 12, 8);
    ctx.fillRect(11, 2, 6, 6);
    ctx.fillStyle = '#3a2b20';
    ctx.fillRect(13, 4, 1, 1);
    ctx.fillRect(16, 4, 1, 1);
    ctx.fillStyle = b.accent;
    ctx.fillRect(11, 0, 2, 3);
    ctx.fillRect(15, 0, 2, 3);
    ctx.fillRect(0, 2, 2, 6);
    ctx.restore();
  }

  /** 다른 플레이어가 죽은 자리 — 비석 모양 (§10) */
  drawGrave(ctx, x, y) {
    ctx.fillStyle = '#4a4a52';
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 16);
    ctx.lineTo(x + 3, y + 6);
    ctx.arc(x + 8, y + 6, 5, Math.PI, 0);
    ctx.lineTo(x + 13, y + 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2f2f36';
    ctx.fillRect(x + 3, y + 14, 10, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 3); ctx.lineTo(x + 8, y + 11);
    ctx.moveTo(x + 5.5, y + 6); ctx.lineTo(x + 10.5, y + 6);
    ctx.stroke();
    ctx.fillStyle = '#7a8060';
    ctx.fillRect(x, y + 15, 3, 3);
    ctx.fillRect(x + 13, y + 15, 3, 3);
  }
}
