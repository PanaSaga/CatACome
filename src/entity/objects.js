// 고양이 · 보물상자 · 정거장 · 플래그 · 지상의 집
import { TILE, CHUNK, CHEST_GRADES, POTION, M_PER_TILE, FLAG } from '../data/balance.js';
import { hash2, mulberry32 } from '../world/rng.js';
import { MAT } from '../world/tiles.js';

export const HOUSE = { x0: 3, y0: -5, x1: 11, y1: -1, doorX: 7 };
// 지상 스폰/복귀 지점 = 집 문 앞. 집 주변 지상 타일(x 2~13, y 0~1)은 파괴 불가라
// 엘리베이터로 올라올 때 자기가 파 놓은 갱도로 떨어지는 일이 없다.
// 굴착은 집에서 왼쪽으로 걸어 나온 x ≤ 1에서 시작한다.
export const SURFACE_SPAWN = { x: HOUSE.doorX, y: -3 };
const CAT_BAND_M = 25;
const ITEM_KINDS = ['bomb', 'drill', 'laser', 'flag'];
const INTERACT_R = 2.5; // 타일 — 상자·고양이·플래그 공통 사거리

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
      if (this.stations.some((t) => t.index === s.index)) continue;
      this.stations.push({
        id: 'S' + s.index, index: s.index, x: s.x, y: s.y,
        depthM: s.depthM, discovered: false, cats: 0,
      });
    }

    if (cy < 0) return;
    // 첫 50m는 고정 배치 구간 (§5-1)
    if (cy <= 3 && cx >= -2 && cx <= 1) return;

    const rnd = mulberry32((cx * 40503) ^ (cy * 90001) ^ (gen.seed + 5));

    // 보물상자 — 밀도 · 등급은 주변 최대 경도로 게이트 (§5-7)
    if (rnd() < 0.6) {
      for (let t = 0; t < 30; t++) {
        const tx = cx * CHUNK + Math.floor(rnd() * CHUNK);
        const ty = cy * CHUNK + Math.floor(rnd() * CHUNK);
        if (world.mat(tx, ty) !== MAT.AIR) continue;
        if (!world.isSolid(tx, ty + 1)) continue;
        const grade = this.rollChestGrade(gen.maxHardnessAround(tx, ty, 3), rnd);
        this.chests.push({ id: this.id('C'), x: tx, y: ty, grade, opened: false });
        break;
      }
    }

    // 고양이 — 깊이 20~30m마다 1마리
    const y0 = cy * CHUNK, y1 = y0 + CHUNK - 1;
    for (let b = 2; b <= 400; b++) {
      const depth = CAT_BAND_M * b + hash2(b, 1, gen.seed + 13) * 10 - 5;
      const ty = Math.round(depth / M_PER_TILE);
      if (ty < y0 || ty > y1) continue;
      const tx = Math.round((hash2(b, 2, gen.seed + 17) * 2 - 1) * 250);
      if (Math.floor(tx / CHUNK) !== cx) continue;
      if (this.cats.some((c) => c.band === b)) continue;
      const spot = this.findAir(tx, ty);
      if (spot) this.cats.push({ id: this.id('K'), band: b, x: spot.x, y: spot.y, carried: false });
    }
  }

  findAir(tx, ty) {
    const world = this.game.world;
    for (let r = 0; r <= 10; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = tx + dx, y = ty + dy;
          if (world.mat(x, y) === MAT.AIR && world.isSolid(x, y + 1)) return { x, y };
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

  addTutorialContent(spawns) {
    for (const c of spawns.chest || []) {
      this.chests.push({ id: this.id('C'), x: c.x, y: c.y, grade: c.grade, opened: false, tutorial: true });
    }
    for (const c of spawns.cat || []) {
      this.cats.push({ id: this.id('K'), band: -1, x: c.x, y: c.y, carried: false });
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
    return out;
  }

  validIds() {
    const s = new Set();
    for (const c of this.chests) if (!c.opened) s.add(c.id);
    for (const c of this.cats) if (!c.carried) s.add(c.id);
    for (const t of this.stations) s.add(t.id);
    for (const f of this.flags) s.add(f.id);
    return s;
  }

  update(dt) {
    const p = this.game.player;
    const pcx = Math.floor(p.cx / TILE / CHUNK), pcy = Math.floor(p.cy / TILE / CHUNK);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.ensureChunk(pcx + dx, pcy + dy);
    // 근처 정거장은 소나 없이도 발견
    for (const s of this.stations) {
      if (s.discovered) continue;
      if (Math.hypot(s.x - p.tileX, s.y - p.tileY) < 10) this.game.discoverStation(s);
    }
  }

  near(tx, ty, x, y, r) { return Math.hypot(tx - x, ty - y) <= r; }

  nearHouse() {
    const p = this.game.player;
    return p.tileX >= HOUSE.x0 - 3 && p.tileX <= HOUSE.x1 + 3 && p.tileY >= HOUSE.y0 - 2 && p.tileY <= 2;
  }

  nearestStation(r = 6) {
    const p = this.game.player;
    let best = null, bd = r;
    for (const s of this.stations) {
      const d = Math.hypot(s.x - p.tileX, s.y - p.tileY);
      if (d <= bd) { bd = d; best = s; }
    }
    return best;
  }

  /**
   * 지금 E가 실제로 집을 대상. 우선순위: 정거장 → 집 → 상자 → 고양이 → 플래그.
   * interact()와 화면의 [E] 안내가 같은 답을 보게 하려고 한곳에 모았다.
   */
  interactTarget() {
    const p = this.game.player;
    const st = this.nearestStation(6);
    if (st) return { kind: 'station', ref: st };
    if (this.nearHouse()) return { kind: 'house', ref: null };
    for (const c of this.chests) {
      if (c.opened) continue;
      if (this.near(c.x, c.y, p.tileX, p.tileY, INTERACT_R)) return { kind: 'chest', ref: c };
    }
    for (const c of this.cats) {
      if (c.carried) continue;
      if (this.near(c.x, c.y, p.tileX, p.tileY, INTERACT_R)) return { kind: 'cat', ref: c };
    }
    for (const f of this.flags) {
      if (this.near(f.x, f.y, p.tileX, p.tileY, INTERACT_R)) return { kind: 'flag', ref: f };
    }
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
    }
    return t.kind;
  }

  openChest(c) {
    const g = this.game;
    c.opened = true;
    const rnd = mulberry32((c.x * 7919) ^ (c.y * 104729) ^ g.world.gen.seed);
    const lines = [];
    if (c.tutorial) {
      for (const k of ['drill', 'laser', 'flag']) { g.run.items[k] = (g.run.items[k] | 0) + 1; lines.push(`${k} +1`); }
    } else {
      const n = c.grade === 3 ? 3 : c.grade === 2 ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const k = ITEM_KINDS[Math.floor(rnd() * ITEM_KINDS.length)];
        const amt = k === 'bomb' ? 2 : 1;
        g.run.items[k] = (g.run.items[k] | 0) + amt;
        lines.push(`${k} +${amt}`);
      }
    }
    g.run.potions[c.grade] = (g.run.potions[c.grade] | 0) + 1;
    lines.push(`${POTION[c.grade].name} 포션 +1`);
    g.player.heal(1); // 모든 등급이 HP +1 (§5-7)
    lines.push('HP +1');
    g.sfx.play('chest');
    g.particles.spawn(c.x * TILE + 8, c.y * TILE + 8, 12, '#ffd766', { spread: 3, life: 0.6 });
    g.toast(`${CHEST_GRADES[c.grade - 1].name} 상자 — ` + lines.join(' · '), 3200);
  }

  pickCat(c) {
    const g = this.game;
    if (g.run.cats.length >= 2) { g.toast('고양이는 동시에 2마리까지'); g.sfx.play('error'); return; }
    c.carried = true;
    g.run.cats.push(c);
    g.sfx.play('cat');
    g.toast('고양이를 업었다');
  }

  /** 집·정거장에서 인계 */
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
    g.sfx.play('deliver');
    g.toast(`고양이 ${n}마리 인계 — 누적 ${g.run.catsDelivered}마리`);
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

    // 정거장
    for (const s of this.stations) {
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

    // 보물상자
    for (const c of this.chests) {
      if (c.opened) continue;
      const x = c.x * TILE - cam.x, y = c.y * TILE - cam.y;
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
        // 옆에 선 플레이어(2타일 높이)에 가리지 않게 머리 위로 올려 그린다
        this.drawPrompt(ctx, x + 8, y - 22, '[E] 열기');
      }
    }

    // 고양이
    for (const c of this.cats) {
      if (c.carried) continue;
      this.drawCat(ctx, c.x * TILE - cam.x, c.y * TILE - cam.y);
    }
    // 업고 있는 고양이
    const p = this.game.player;
    this.game.run.cats.forEach((c, i) => {
      this.drawCat(ctx, p.x - cam.x + (i === 0 ? -2 : 6), p.y - cam.y - 12 - i * 3, 0.85);
    });

    // 플래그
    for (const f of this.flags) {
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
    }
  }

  /** 어떤 배경 위에서도 읽히게 어두운 판을 깔고 쓰는 [E] 안내 */
  drawPrompt(ctx, x, y, text) {
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - w / 2, y - 11, w, 15);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  }

  drawCat(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#e8a33d';
    ctx.fillRect(2, 6, 12, 8);
    ctx.fillRect(11, 2, 6, 6);
    ctx.fillStyle = '#3a2b20';
    ctx.fillRect(13, 4, 1, 1);
    ctx.fillRect(16, 4, 1, 1);
    ctx.fillStyle = '#e8a33d';
    ctx.fillRect(11, 0, 2, 3);
    ctx.fillRect(15, 0, 2, 3);
    ctx.fillRect(0, 2, 2, 6);
    ctx.restore();
  }
}
