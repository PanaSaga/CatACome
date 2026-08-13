// 곡괭이 · 폭탄 · 드릴 · 레이저 · 플래그 · 포션
import {
  TILE, PICK_CD, PICK_REACH, PICK_HIT_R, PICK_DMG, ITEM_DMG,
  BOMB, DRILL, DRILL_DRAIN_SEC, LASER, FLAG, POTION, DYNAMITE,
} from '../data/balance.js';
import { MAT, matOf, hardnessOf, isDiggable, isBlastable, MAT_COLOR } from '../world/tiles.js';

// 레이저 발사 애니메이션 — 빔이 순간이 아니라 짧게 자라났다 사그라든다 ("피융!")
const LASER_GROW_T = 0.07;
const LASER_HOLD_T = 0.05;
const LASER_FADE_T = 0.16;
const LASER_ANIM_T = LASER_GROW_T + LASER_HOLD_T + LASER_FADE_T;

export const SLOTS = ['pickaxe', 'bomb', 'drill', 'laser', 'flag', 'potion'];

/** 이모지로는 드릴·레이저건이 잘 읽히지 않아 작은 캔버스로 직접 그린다 (§6) */
function drawIcon(draw) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  draw(c.getContext('2d'));
  return `<img src="${c.toDataURL()}" width="26" height="26" alt="" style="image-rendering:pixelated;vertical-align:middle" />`;
}

const DRILL_ICON = drawIcon((ctx) => {
  ctx.translate(16, 17);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#3a2b20';
  ctx.fillRect(-6, 6, 12, 9); // 손잡이/모터
  ctx.fillStyle = '#8a5a3c';
  ctx.fillRect(-4, -12, 8, 18); // 자루
  ctx.strokeStyle = '#5a4028';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-4, -10 + i * 5);
    ctx.lineTo(4, -7 + i * 5);
    ctx.stroke();
  }
  ctx.fillStyle = '#c9ccd8';
  ctx.beginPath();
  ctx.moveTo(-4, -12); ctx.lineTo(4, -12); ctx.lineTo(0, -20);
  ctx.closePath();
  ctx.fill();
});

const LASER_ICON = drawIcon((ctx) => {
  ctx.translate(3, 17);
  ctx.fillStyle = '#3a3a46';
  ctx.fillRect(0, -4, 19, 7); // 총열
  ctx.fillRect(3, 3, 6, 9);   // 손잡이
  ctx.fillStyle = '#20202a';
  ctx.fillRect(0, -1, 19, 1);
  ctx.fillStyle = '#ffb0b8';
  ctx.fillRect(17, -3, 5, 5); // 총구 불빛
  ctx.fillStyle = '#ff5566';
  ctx.fillRect(22, -1, 7, 2); // 빔
});

export const SLOT_ICON = { pickaxe: '⛏', bomb: '💣', drill: DRILL_ICON, laser: LASER_ICON, flag: '🚩', potion: '🧪' };

function rectFor(cx, cy, side, facing) {
  let x0, y0;
  if (side % 2 === 1) {
    x0 = cx - (side - 1) / 2;
    y0 = cy - (side - 1) / 2;
  } else {
    // 짝수 면적은 겨누는 방향으로 확장, 세로는 아래로 (§3-1)
    x0 = facing > 0 ? cx : cx - (side - 1);
    y0 = cy;
  }
  return { x0, y0, x1: x0 + side - 1, y1: y0 + side - 1 };
}

function maxDiggableH(world, r) {
  let mx = 0;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const m = world.mat(x, y);
      if (!isDiggable(m)) continue; // 기반암·액체는 최대 경도 산정에서 제외 (§11-2)
      const h = hardnessOf(m);
      if (h > mx) mx = h;
    }
  }
  return mx;
}

/**
 * §3-1 파괴 면적·필요 타수. 범위(range)와 공격력(power)은 이제 완전히 분리된 역할이다 —
 * 범위는 오직 정사각형 한 변의 길이(1x1~3x3)만 정하고, 경도가 세다고 줄지 않는다.
 * 필요 타수는 오직 공격력과 그 영역의 최대 경도로만 정해진다(공격력 1·경도2 → 2대).
 */
export function pickaxeArea(world, cx, cy, rangeLv, powerLv, facing) {
  const side = rangeLv;
  const r = rectFor(cx, cy, side, facing);
  const maxH = maxDiggableH(world, r) || 1;
  const hits = Math.max(1, maxH - powerLv + 1);
  const tiles = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) tiles.push([x, y]);
  return { tiles, side, hits, maxH, rect: r };
}

/**
 * 눈높이에서 커서 방향으로 훑어 캐릭터에 가장 가까운 파괴 대상 타일을 찾는다 (§3-1).
 * 커서가 놓인 타일이 아니라 이 타일을 곡괭이가 노린다 — 벽 너머를 파는 일이 없다.
 * 액체는 통과하고, 상자·고양이가 든 타일은 부술 수 없으니 건너뛴다.
 * @returns {{x:number,y:number}|null}
 */
export function nearestDigTile(game, world, ox, oy, dx, dy, maxTiles) {
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;
  let lx = null, ly = null;
  for (let d = 0.25; d <= maxTiles; d += 0.25) {
    const tx = Math.floor((ox + nx * d * TILE) / TILE);
    const ty = Math.floor((oy + ny * d * TILE) / TILE);
    if (tx === lx && ty === ly) continue;
    lx = tx; ly = ty;
    const m = world.mat(tx, ty);
    if (m === MAT.AIR || m === MAT.WATER || m === MAT.LAVA) continue;
    if (game.objects.blocksTile(tx, ty)) continue;
    return { x: tx, y: ty };
  }
  return null;
}

/** 직선 빔이 지나는 타일. blocked = 경도 한계에 막힌 지점 */
export function beamTiles(world, ox, oy, dx, dy, lengthTiles, width, maxHardness) {
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;
  const px = -ny, py = nx;
  const seen = new Set();
  const tiles = [];
  const half = (width - 1) / 2;
  for (let d = 0.5; d <= lengthTiles; d += 0.5) {
    let blocked = false;
    for (let w = -half; w <= half; w += 1) {
      const wx = ox + nx * d * TILE + px * w * TILE;
      const wy = oy + ny * d * TILE + py * w * TILE;
      const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
      const k = tx + ',' + ty;
      if (seen.has(k)) continue;
      seen.add(k);
      const m = world.mat(tx, ty);
      if (isDiggable(m) && hardnessOf(m) > maxHardness) { blocked = true; continue; }
      if (!isDiggable(m) && m !== MAT.AIR && m !== MAT.WATER && m !== MAT.LAVA) { blocked = true; continue; }
      tiles.push([tx, ty]);
    }
    if (blocked) return { tiles, stopped: d };
  }
  return { tiles, stopped: lengthTiles };
}

/** 폭발 — 폭탄·다이너마이트 공용 */
export function explode(game, px, py, radiusTiles, enemyDmg, oreBonus = 0, playerDmg = 1) {
  const world = game.world;
  const ctx0 = Math.floor(px / TILE), cty0 = Math.floor(py / TILE);
  const R = Math.ceil(radiusTiles);
  let gained = 0;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > radiusTiles * radiusTiles) continue;
      const x = ctx0 + dx, y = cty0 + dy;
      if (game.objects.blocksTile(x, y)) continue;
      const m = world.mat(x, y);
      if (m === MAT.DYNAMITE) { game.tools.primeDynamite(x, y); continue; }
      if (!isBlastable(m)) continue;
      const res = world.breakTile(x, y, true);
      if (res) gained += res.drop * (1 + oreBonus);
    }
  }
  if (gained > 0) game.gainCopper(Math.floor(gained));
  game.enemies.hitCircle(px, py, radiusTiles * TILE, enemyDmg);
  const p = game.player;
  if (Math.hypot(p.cx - px, p.cy - py) < radiusTiles * TILE) p.damage(playerDmg, '폭발');
  game.camera.shake(12, 0.3);
  game.particles.ring(px, py, 16, '#ffb347', 5);
  game.particles.spawn(px, py, 14, '#ff7a2f', { spread: 4, life: 0.5 });
  game.sfx.play('explode');
}

export class Tools {
  constructor(game) {
    this.game = game;
    this.slot = 0;
    this.pickCd = 0;
    this.multiKey = null;
    this.multiCount = 0;
    this.bombs = [];
    this.primed = [];
    this.drillCharge = 0;
    this.drillTick = 0;
    this.drilling = false;
    this.drillEmptyWarned = false;
    this.laserCd = 0;
    this.laserEmptyWarned = false;
    this.beamFx = null;
    this.beamFxT = 0;
  }

  reset() {
    this.slot = 0;
    this.pickCd = 0;
    this.multiKey = null;
    this.multiCount = 0;
    this.bombs.length = 0;
    this.primed.length = 0;
    this.drillCharge = 0;
    this.drilling = false;
    this.drillEmptyWarned = false;
    this.laserCd = 0;
    this.laserEmptyWarned = false;
    this.beamFx = null;
  }

  get name() { return SLOTS[this.slot]; }

  // ── 갱신 ───────────────────────────────────────────────────────
  update(dt, world, input) {
    const g = this.game;
    this.pickCd = Math.max(0, this.pickCd - dt);
    this.laserCd = Math.max(0, this.laserCd - dt);
    this.beamFxT = Math.max(0, this.beamFxT - dt);

    // 슬롯 전환 — 패널 밖에서만 (§2)
    for (let i = 1; i <= 6; i++) if (input.pressed(String(i))) this.slot = i - 1;
    const w = input.takeWheel();
    if (w) this.slot = (this.slot + w + 6) % 6;

    this.updateBombs(dt, world);
    this.updatePrimed(dt);

    if (g.player.dead) { this.drilling = false; return; }

    // 매몰 탈출 — 좌클릭 연타
    if (g.player.buried > 0) {
      this.drilling = false;
      if (input.mouseClicked(0)) {
        g.player.buried -= 1;
        g.sfx.dig(2);
        if (g.player.buried <= 0) g.toast('탈출!');
      }
      return;
    }

    const held = input.mouseDown(0);
    const clicked = input.mouseClicked(0);

    if (this.name !== 'drill') { this.drilling = false; this.drillCharge = 0; this.drillEmptyWarned = false; }
    if (this.name !== 'laser') this.laserEmptyWarned = false;

    switch (this.name) {
      case 'pickaxe':
        if (held && this.pickCd <= 0) this.swingPickaxe(world);
        break;
      case 'bomb':
        if (clicked) this.throwBomb();
        break;
      case 'drill':
        if (held) this.useDrill(dt, world);
        else { this.drilling = false; this.drillCharge = 0; this.drillEmptyWarned = false; }
        break;
      case 'laser':
        if (held && this.laserCd <= 0) this.fireLaser(world);
        else if (!held) this.laserEmptyWarned = false;
        break;
      case 'flag':
        if (clicked) g.requestFlagPlacement();
        break;
      case 'potion':
        if (clicked) this.usePotion();
        break;
    }
  }

  // ── 곡괭이 ─────────────────────────────────────────────────────
  /** 이번 스윙이 노리는 타일. 미리보기와 실제 파괴가 같은 값을 쓴다. */
  pickTarget(world) {
    const g = this.game;
    const p = g.player;
    return nearestDigTile(g, world, p.eyeX, p.eyeY, g.aim.dx, g.aim.dy, PICK_REACH);
  }

  /** 커서를 사거리로 자른 지점 — 공격 판정의 중심 */
  attackPoint() {
    const p = this.game.player;
    const aim = this.game.aim;
    const len = Math.hypot(aim.dx, aim.dy) || 1;
    const d = Math.min(len, PICK_REACH * TILE);
    return { x: p.eyeX + (aim.dx / len) * d, y: p.eyeY + (aim.dy / len) * d };
  }

  swingPickaxe(world) {
    const g = this.game;
    const p = g.player;
    const aim = g.aim;
    // 커서는 방향만 정한다. 실제로 파는 건 그 방향에서 가장 가까운 블록.
    const t = this.pickTarget(world);
    const rangeLv = g.profile.upgrades.pickRange;
    const speedLv = g.profile.upgrades.pickSpeed;
    // 파낼 블록이 없어도 휘두른다 — 공중의 박쥐를 때릴 수 없으면 안 된다
    const area = t ? pickaxeArea(world, t.x, t.y, rangeLv, g.pickPower(), p.facing) : null;
    const hit = this.attackPoint();

    if (area) {
      const key = t.x + ',' + t.y;
      if (this.multiKey !== key) { this.multiKey = key; this.multiCount = 0; }
      this.multiCount++;
    } else {
      this.multiKey = null;
      this.multiCount = 0;
    }
    this.pickCd = PICK_CD[speedLv - 1];

    p.swingPick(aim.dx, aim.dy); // 휘두르는 모션
    g.sfx.dig(area ? area.maxH : 1);
    g.enemies.onNoise(1); // 곡괭이 1스윙 = 두더지 1타일 (§4-3)
    // 파괴 영역 + 커서 주변 원을 합쳐 한 번만 판정한다
    g.enemies.hitSwing(area ? area.tiles : [], hit.x, hit.y, PICK_HIT_R, PICK_DMG[g.pickPower() - 1]);
    g.particles.spawn(hit.x, hit.y, 3, '#c8b9a0', { spread: 1.4, life: 0.25, size: 2 });

    if (area && this.multiCount >= area.hits) {
      this.multiCount = 0;
      this.breakTiles(area.tiles, 0);
    }
  }

  breakTiles(tiles, oreBonus = 0, blast = false) {
    const g = this.game;
    let gained = 0;
    let any = false;
    for (const [x, y] of tiles) {
      if (g.objects.blocksTile(x, y)) continue;
      const m = g.world.mat(x, y);
      if (m === MAT.DYNAMITE) { this.primeDynamite(x, y); continue; }
      const res = g.world.breakTile(x, y, blast);
      if (!res) continue;
      any = true;
      gained += res.drop * (1 + oreBonus);
      const col = MAT_COLOR[res.mat] || [200, 200, 200];
      g.particles.spawn(x * TILE + 8, y * TILE + 8, 4, `rgb(${col[0]},${col[1]},${col[2]})`, { spread: 1.8, life: 0.35, size: 3 });
      if (res.ore) {
        g.sfx.play(res.ore === 3 ? 'gold' : 'pickup', 1 + Math.random() * 0.1);
        g.particles.spawn(x * TILE + 8, y * TILE + 8, 5, res.ore === 3 ? '#f5c736' : res.ore === 2 ? '#d8e0e8' : '#d07738', { spread: 2.2, life: 0.5 });
      }
    }
    if (gained > 0) g.gainCopper(Math.floor(gained));
    return any;
  }

  // ── 폭탄 ───────────────────────────────────────────────────────
  throwBomb() {
    const g = this.game;
    if ((g.run.items.bomb | 0) <= 0) { g.sfx.play('error'); g.toast('폭탄이 없다'); return; }
    g.run.items.bomb--;
    const lv = g.itemLevel('bomb');
    const p = g.player;
    const a = g.aim;
    const len = Math.hypot(a.dx, a.dy) || 1;
    this.bombs.push({
      x: p.eyeX, y: p.eyeY,
      vx: (a.dx / len) * 7, vy: (a.dy / len) * 7 - 1.2,
      fuse: BOMB.fuse[lv - 1], lv,
    });
    g.sfx.play('bombThrow');
  }

  updateBombs(dt, world) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.fuse -= dt;
      b.vy = Math.min(b.vy + 0.42, 11);
      const nx = b.x + b.vx, ny = b.y + b.vy;
      const hit = world.isSolid(Math.floor(nx / TILE), Math.floor(ny / TILE));
      if (hit || b.fuse <= 0) {
        this.bombs.splice(i, 1);
        explode(this.game, hit ? b.x : nx, hit ? b.y : ny, BOMB.radius[b.lv - 1], ITEM_DMG[b.lv - 1], BOMB.oreBonus[b.lv - 1]);
        continue;
      }
      b.x = nx; b.y = ny;
    }
  }

  // ── 다이너마이트 (§4-2) ────────────────────────────────────────
  primeDynamite(x, y) {
    if (this.primed.some((p) => p.x === x && p.y === y)) return;
    this.game.world.set(x, y, 0);
    this.primed.push({ x, y, t: DYNAMITE.fuse, left: DYNAMITE.chain });
    this.game.toast('다이너마이트가 점화됐다!');
  }

  updatePrimed(dt) {
    for (let i = this.primed.length - 1; i >= 0; i--) {
      const d = this.primed[i];
      d.t -= dt;
      if (d.t > 0) continue;
      explode(this.game, d.x * TILE + 8, d.y * TILE + 8, DYNAMITE.radius, DYNAMITE.enemyDmg, 0, 1);
      d.left--;
      if (d.left <= 0) this.primed.splice(i, 1);
      else d.t = DYNAMITE.gap;
    }
  }

  /** 플레이어가 다이너마이트 타일에 접촉 */
  checkDynamiteContact() {
    const p = this.game.player;
    for (const [dx, dy] of [[0, 0], [0, 1]]) {
      const x = p.tileX + dx, y = Math.floor(p.y / TILE) + dy;
      if (this.game.world.mat(x, y) === MAT.DYNAMITE) this.primeDynamite(x, y);
    }
  }

  // ── 드릴 — 조준 방향으로 겨눈 채 홀드하면 주욱 파고든다 (§5-2) ────
  // 경도를 무시한다 — 기반암 등 원래부터 불괴인 재질만 beamTiles()가 막는다.
  useDrill(dt, world) {
    const g = this.game;
    if ((g.run.items.drill | 0) <= 0) {
      if (!this.drillEmptyWarned) { g.sfx.play('error'); g.toast('드릴 충전이 없다'); this.drillEmptyWarned = true; }
      this.drilling = false;
      return;
    }
    const lv = g.itemLevel('drill');
    const a = g.aim;
    const p = g.player;
    const beam = beamTiles(world, p.eyeX, p.eyeY, a.dx, a.dy, DRILL.length[lv - 1], DRILL.width[lv - 1], Infinity);
    this.drilling = true;
    this.drillAngle = Math.atan2(a.dy, a.dx);

    // 홀드 지속시간(초)당 1칸 소모
    this.drillCharge += dt;
    if (this.drillCharge >= DRILL_DRAIN_SEC) { this.drillCharge -= DRILL_DRAIN_SEC; g.run.items.drill--; }

    g.enemies.hitTilesDot(beam.tiles, ITEM_DMG[lv - 1] * dt);
    this.drillTick -= dt;
    if (this.drillTick <= 0) {
      this.drillTick = 0.1;
      g.sfx.play('drill', 1 + (Math.random() - 0.5) * 0.16);
      g.enemies.onNoise(1);
      let broke = 0;
      for (const [x, y] of beam.tiles) {
        if (broke >= 2) break;
        if (g.world.mat(x, y) === MAT.AIR) continue;
        if (this.breakTiles([[x, y]], 0)) broke++;
      }
      const len = Math.hypot(a.dx, a.dy) || 1;
      const tipX = p.eyeX + (a.dx / len) * beam.stopped * TILE, tipY = p.eyeY + (a.dy / len) * beam.stopped * TILE;
      g.particles.spawn(tipX, tipY, 3, '#c8b9a0', { spread: 1.6, life: 0.3, size: 2 });
    }
  }

  // ── 레이저 — "피융!" 하고 순간이 아니라 짧게 뻗어나가는 빔 ───────
  // 경도를 무시한다 — 기반암 등 원래부터 불괴인 재질만 beamTiles()가 막는다.
  fireLaser(world) {
    const g = this.game;
    if ((g.run.items.laser | 0) <= 0) {
      this.laserCd = LASER.cd; // 빈 채로 계속 홀드해도 매 프레임 재시도하지 않게 쿨을 건다
      if (!this.laserEmptyWarned) { g.sfx.play('error'); g.toast('레이저가 없다'); this.laserEmptyWarned = true; }
      return;
    }
    this.laserEmptyWarned = false;
    g.run.items.laser--;
    const lv = g.itemLevel('laser');
    const a = g.aim;
    const p = g.player;
    const beam = beamTiles(world, p.eyeX, p.eyeY, a.dx, a.dy, LASER.range[lv - 1], LASER.width[lv - 1], Infinity);
    this.laserCd = LASER.cd;
    this.beamFx = { kind: 'laser', ox: p.eyeX, oy: p.eyeY, dx: a.dx, dy: a.dy, len: beam.stopped };
    this.beamFxT = LASER_ANIM_T;
    g.sfx.play('laser');
    g.particles.ring(p.eyeX, p.eyeY, 10, '#ff5566', 4);
    g.particles.spawn(p.eyeX, p.eyeY, 6, '#ffd0d8', { spread: 3, life: 0.18, size: 2 });
    g.enemies.hitTiles(beam.tiles, ITEM_DMG[lv - 1]);
    this.breakTiles(beam.tiles, LASER.oreBonus[lv - 1]);
  }

  // ── 포션 ───────────────────────────────────────────────────────
  usePotion() {
    const g = this.game;
    const p = g.run.potions;
    const grade = [1, 2, 3].find((k) => (p[k] | 0) > 0);
    if (!grade) { g.sfx.play('error'); g.toast('포션이 없다'); return; }
    if (g.player.hp >= g.player.maxHp) { g.sfx.play('error'); g.toast('HP가 이미 최대다'); return; }
    p[grade]--;
    g.player.heal(POTION[grade].heal);
    g.sfx.play('potion');
    g.toast(`${POTION[grade].name} 포션 — HP +${POTION[grade].heal}`);
  }

  // ── 렌더 ───────────────────────────────────────────────────────
  draw(ctx, cam) {
    const g = this.game;
    // 폭탄
    for (const b of this.bombs) {
      ctx.fillStyle = '#26262e';
      ctx.beginPath();
      ctx.arc(Math.round(b.x - cam.x), Math.round(b.y - cam.y), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = b.fuse < 0.4 && Math.floor(b.fuse * 20) % 2 === 0 ? '#fff' : '#f0d060';
      ctx.fillRect(Math.round(b.x - cam.x) - 1, Math.round(b.y - cam.y) - 8, 2, 4);
    }
    // 점화된 다이너마이트
    for (const d of this.primed) {
      const blink = Math.floor(d.t * 12) % 2 === 0;
      ctx.fillStyle = blink ? '#ff5545' : '#ffd0a0';
      ctx.fillRect(d.x * TILE - cam.x + 3, d.y * TILE - cam.y + 3, 10, 10);
    }
    // 레이저 — 자라났다 사그라드는 빔 ("피융!")
    if (this.beamFxT > 0 && this.beamFx) {
      const b = this.beamFx;
      const elapsed = LASER_ANIM_T - this.beamFxT;
      const growT = Math.min(1, elapsed / LASER_GROW_T);
      const ease = 1 - Math.pow(1 - growT, 3);
      const curLen = b.len * ease;
      let alpha = 1;
      if (elapsed > LASER_GROW_T + LASER_HOLD_T) {
        const fadeT = (elapsed - LASER_GROW_T - LASER_HOLD_T) / LASER_FADE_T;
        alpha = Math.max(0, 1 - fadeT);
      }
      const len = Math.hypot(b.dx, b.dy) || 1;
      const ex = b.ox + (b.dx / len) * curLen * TILE;
      const ey = b.oy + (b.dy / len) * curLen * TILE;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(255,80,120,0.5)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(b.ox - cam.x, b.oy - cam.y);
      ctx.lineTo(ex - cam.x, ey - cam.y);
      ctx.stroke();
      ctx.strokeStyle = '#fff0f4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.ox - cam.x, b.oy - cam.y);
      ctx.lineTo(ex - cam.x, ey - cam.y);
      ctx.stroke();
      if (growT < 1) {
        ctx.fillStyle = 'rgba(255,220,230,0.9)';
        ctx.beginPath();
        ctx.arc(b.ox - cam.x, b.oy - cam.y, 6 * (1 - growT) + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.lineWidth = 1;
    }

    // 드릴 — 장착 중이면 항상 조준 방향으로 겨눈다
    if (this.name === 'drill' && !g.player.dead) {
      const p = g.player;
      const aim = g.aim;
      const ang = Math.atan2(aim.dy, aim.dx);
      const sx = p.x - cam.x, sy = p.y - cam.y;
      const jitter = this.drilling ? (Math.random() - 0.5) * 1.6 : 0;
      ctx.save();
      ctx.translate(sx + 8, sy + 14);
      ctx.rotate(ang);
      ctx.translate(0, jitter);
      ctx.fillStyle = '#3a2b20';
      ctx.fillRect(-2, -3, 10, 6); // 손잡이
      ctx.fillStyle = '#8a5a3c';
      ctx.fillRect(6, -2, 8, 4); // 자루
      ctx.fillStyle = '#c9ccd8';
      ctx.beginPath();
      ctx.moveTo(13, -4); ctx.lineTo(13, 4); ctx.lineTo(20, 0);
      ctx.closePath();
      ctx.fill(); // 뾰족한 드릴 비트
      if (this.drilling) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.moveTo(13, -3 + i * 3);
          ctx.lineTo(18, -0.5 + i * 1.5);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 조준 · 대상 영역
    if (!g.player.dead) {
      const aim = g.aim;
      const p = g.player;
      const t = this.name === 'pickaxe' ? this.pickTarget(g.world) : null;
      if (t) {
        const area = pickaxeArea(g.world, t.x, t.y, g.profile.upgrades.pickRange, g.pickPower(), p.facing);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(area.rect.x0 * TILE - cam.x + 0.5, area.rect.y0 * TILE - cam.y + 0.5, area.side * TILE - 1, area.side * TILE - 1);
        if (area.hits > 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.font = '10px monospace';
          ctx.fillText(`${this.multiCount}/${area.hits}`, area.rect.x0 * TILE - cam.x, area.rect.y0 * TILE - cam.y - 3);
        }
      }
      // 커서
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(aim.x - cam.x, aim.y - cam.y, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
