// 적 5종 (§4-3). 등장 조건은 깊이가 아니라 주변 암반 경도.
import {
  TILE, ENEMY, ENEMY_HIT_PAD, MOLE_HEAR, MOLE_AUDIBLE, MOLE_SILHOUETTE,
  CENTI_DIVE, CENTI_RESURFACE, CHUNK,
} from '../data/balance.js';
import { hash2, mulberry32 } from '../world/rng.js';
import { MAT, isSolidMat } from '../world/tiles.js';

const MAX_ACTIVE = 44;
const DESPAWN_TILES = 120;

const SIZE = {
  ant: [12, 10], bat: [14, 12], spider: [16, 14],
  spiderling: [8, 8], mole: [14, 14], centipede: [28, 12],
};

function solid(world, px, py) {
  return isSolidMat(world.mat(Math.floor(px / TILE), Math.floor(py / TILE)));
}

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spawned = new Set();
    this.nextId = 1;
  }

  reset() {
    this.list.length = 0;
    this.spawned.clear();
  }

  make(type, tx, ty) {
    const [w, h] = SIZE[type];
    const e = {
      id: 'e' + this.nextId++,
      type, hp: ENEMY[type].hp, maxHp: ENEMY[type].hp,
      x: tx * TILE + (TILE - w) / 2, y: ty * TILE + (TILE - h) / 2,
      vx: 0, vy: 0, w, h, dir: Math.random() < 0.5 ? -1 : 1,
      t: 0, state: type === 'spider' ? 'hang' : 'idle',
      pending: 0, dot: 0, hurtT: 0,
    };
    this.list.push(e);
    return e;
  }

  /** 청크 단위 결정론 배치 */
  ensureChunk(cx, cy) {
    const key = cx + ',' + cy;
    if (this.spawned.has(key)) return;
    this.spawned.add(key);
    if (cy < 0) return; // 지상은 안전지대
    // 첫 50m는 고정 배치 구간이라 무작위 스폰을 하지 않는다 (§5-1)
    if (cy <= 3 && cx >= -2 && cx <= 1) return;
    if (this.list.length > MAX_ACTIVE) return;
    const rnd = mulberry32((cx * 73856093) ^ (cy * 19349663) ^ this.game.world.gen.seed);
    const n = rnd() < 0.45 ? 0 : 1 + Math.floor(rnd() * 2);
    const world = this.game.world;
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 24; tries++) {
        const tx = cx * CHUNK + Math.floor(rnd() * CHUNK);
        const ty = cy * CHUNK + Math.floor(rnd() * CHUNK);
        if (world.mat(tx, ty) !== MAT.AIR) continue;
        const h = world.gen.maxHardnessAround(tx, ty, 2);
        const pool = ['ant', 'bat', 'spider'];
        if (h >= 2) pool.push('mole');
        if (h >= 3) pool.push('centipede');
        const type = pool[Math.floor(rnd() * pool.length)];
        if ((type === 'ant' || type === 'spiderling') && !world.isSolid(tx, ty + 1)) continue;
        if (type === 'spider' && !world.isSolid(tx, ty - 1)) continue;
        this.make(type, tx, ty);
        break;
      }
    }
  }

  /** 소리 이벤트 — 두더지가 tiles만큼 접근 (§4-3) */
  onNoise(tiles) {
    const p = this.game.player;
    for (const e of this.list) {
      if (e.type !== 'mole') continue;
      const d = Math.hypot(e.x - p.cx, e.y - p.cy) / TILE;
      if (d <= MOLE_HEAR) e.pending += tiles;
    }
  }

  hurt(e, dmg) {
    if (e.state === 'dive') return; // 잠수 중 무적
    e.hp -= dmg;
    e.hurtT = 0.14;
    this.game.particles.spawn(e.x + e.w / 2, e.y + e.h / 2, 4, '#ff6b6b', { spread: 2, life: 0.3 });
    if (e.type === 'centipede' && e.hp > 0) this.dive(e);
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    this.game.particles.spawn(e.x + e.w / 2, e.y + e.h / 2, 8, '#c04040', { spread: 3, life: 0.5 });
    this.game.sfx.play('hurt', 1.4);
    if (e.type === 'spider') {
      // 처치 시 새끼거미 3마리 분열 (새끼는 분열하지 않는다)
      for (let i = 0; i < 3; i++) {
        const s = this.make('spiderling', Math.floor(e.x / TILE), Math.floor(e.y / TILE));
        s.vx = (i - 1) * 1.4;
        s.vy = -2;
        s.state = 'crawl';
      }
    }
  }

  tileSet(tiles) {
    const s = new Set();
    for (const [x, y] of tiles) s.add(x + ',' + y);
    return s;
  }

  hitTiles(tiles, dmg) {
    if (dmg <= 0) return;
    const s = this.tileSet(tiles);
    for (const e of [...this.list]) {
      if (this.overlapsTiles(e, s)) this.hurt(e, dmg);
    }
  }

  /** 드릴 지속 피해 — 소수점 누적 */
  hitTilesDot(tiles, amount) {
    const s = this.tileSet(tiles);
    for (const e of [...this.list]) {
      if (!this.overlapsTiles(e, s)) continue;
      e.dot += amount;
      if (e.dot >= 1) {
        const n = Math.floor(e.dot);
        e.dot -= n;
        this.hurt(e, n);
      }
    }
  }

  /** 피해 판정에만 쓰는 여유 박스 (§4-3). 접촉 피해·이동은 원래 크기를 쓴다. */
  hitBox(e) {
    return {
      x: e.x - ENEMY_HIT_PAD, y: e.y - ENEMY_HIT_PAD,
      w: e.w + ENEMY_HIT_PAD * 2, h: e.h + ENEMY_HIT_PAD * 2,
    };
  }

  overlapsTiles(e, set) {
    const b = this.hitBox(e);
    const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 1) / TILE);
    const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 1) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (set.has(x + ',' + y)) return true;
    return false;
  }

  hitCircle(px, py, r, dmg) {
    for (const e of [...this.list]) {
      const b = this.hitBox(e);
      // 중심점 거리가 아니라 여유 박스와의 최단 거리로 잰다
      const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
      const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
      if (Math.hypot(dx, dy) <= r) this.hurt(e, dmg);
    }
  }

  update(dt, world) {
    const p = this.game.player;
    // 플레이어 주변 청크에만 배치
    const pcx = Math.floor(p.cx / TILE / CHUNK), pcy = Math.floor(p.cy / TILE / CHUNK);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.ensureChunk(pcx + dx, pcy + dy);

    let moleNear = false;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      e.hurtT = Math.max(0, e.hurtT - dt);
      const dxT = (p.cx - (e.x + e.w / 2)) / TILE;
      const dyT = (p.cy - (e.y + e.h / 2)) / TILE;
      const distT = Math.hypot(dxT, dyT);

      if (distT > DESPAWN_TILES) { this.list.splice(i, 1); continue; }

      switch (e.type) {
        case 'ant': case 'spiderling': this.updateWalker(e, world, dxT, distT); break;
        case 'bat': this.updateBat(e, world, dxT, dyT, distT); break;
        case 'spider': this.updateSpider(e, world, dxT, dyT, distT); break;
        case 'mole':
          this.updateMole(e, world, dt, distT);
          if (distT <= MOLE_AUDIBLE) moleNear = true;
          break;
        case 'centipede': this.updateCentipede(e, world, dt, dxT, dyT, distT); break;
      }

      // 접촉 피해
      if (e.state !== 'dive' && !p.dead && this.overlapsPlayer(e, p)) {
        if (p.damage(1, e.type)) {
          const kx = Math.sign(p.cx - (e.x + e.w / 2)) || 1;
          p.vx = kx * 3.2;
          p.vy = -3.4;
        }
      }
    }

    if (moleNear && Math.random() < dt * 2.2) this.game.sfx.play('scratch');
  }

  overlapsPlayer(e, p) {
    return e.x < p.x + p.w && e.x + e.w > p.x && e.y < p.y + p.h && e.y + e.h > p.y;
  }

  // 지면 보행 — 벽·낭떠러지에서 방향 전환, 근처면 추적
  updateWalker(e, world, dxT, distT) {
    const spd = ENEMY[e.type].speed;
    if (distT < 20 && Math.abs(dxT) > 0.4) e.dir = Math.sign(dxT);
    e.vy = Math.min(e.vy + 0.5, 10);
    const nx = e.x + e.dir * spd;
    if (solid(world, e.dir > 0 ? nx + e.w : nx, e.y + e.h - 2)) e.dir *= -1;
    else e.x = nx;
    const ny = e.y + e.vy;
    if (solid(world, e.x + 2, ny + e.h) || solid(world, e.x + e.w - 2, ny + e.h)) {
      e.y = Math.floor((ny + e.h) / TILE) * TILE - e.h;
      e.vy = 0;
    } else e.y = ny;
  }

  // 불규칙 비행 후 직선 돌진
  updateBat(e, world, dxT, dyT, distT) {
    const spd = ENEMY.bat.speed;
    if (distT < 14) {
      if (e.state !== 'dash') { e.state = 'dash'; e.dashT = 0.9; e.dvx = dxT; e.dvy = dyT; }
      e.dashT -= 1 / 60;
      const l = Math.hypot(e.dvx, e.dvy) || 1;
      e.vx = (e.dvx / l) * spd * 1.9;
      e.vy = (e.dvy / l) * spd * 1.9;
      if (e.dashT <= 0) e.state = 'idle';
    } else {
      e.state = 'idle';
      e.vx = Math.cos(e.t * 2.1 + e.id.length) * spd;
      e.vy = Math.sin(e.t * 3.3) * spd * 0.8;
    }
    if (!solid(world, e.x + e.vx + (e.vx > 0 ? e.w : 0), e.y + e.h / 2)) e.x += e.vx; else e.vx *= -1;
    if (!solid(world, e.x + e.w / 2, e.y + e.vy + (e.vy > 0 ? e.h : 0))) e.y += e.vy; else e.vy *= -1;
  }

  // 천장에 매달렸다가 아래를 지나면 낙하 기습
  updateSpider(e, world, dxT, dyT, distT) {
    if (e.state === 'hang') {
      if (Math.abs(dxT) < 8 && dyT > 0 && dyT < 14) {
        e.state = 'fall';
        this.game.sfx.play('scratch');
      }
      return;
    }
    e.vy = Math.min(e.vy + 0.5, 10);
    const ny = e.y + e.vy;
    if (solid(world, e.x + 2, ny + e.h) || solid(world, e.x + e.w - 2, ny + e.h)) {
      e.y = Math.floor((ny + e.h) / TILE) * TILE - e.h;
      e.vy = 0;
      e.state = 'crawl';
    } else e.y = ny;
    if (e.state === 'crawl') this.updateWalker(e, world, dxT, distT);
  }

  // 소리 추적 — 파는 걸 멈추면 두더지도 멈춘다
  updateMole(e, world, dt, distT) {
    if (e.pending > 0) {
      const p = this.game.player;
      const dx = p.cx - (e.x + e.w / 2), dy = p.cy - (e.y + e.h / 2);
      const l = Math.hypot(dx, dy) || 1;
      const step = Math.min(e.pending * TILE, 70 * dt);
      e.x += (dx / l) * step;
      e.y += (dy / l) * step;
      e.pending -= step / TILE;
      if (e.pending < 0.001) e.pending = 0;
    }
    e.inWall = solid(world, e.x + e.w / 2, e.y + e.h / 2);
  }

  dive(e) {
    e.state = 'dive';
    e.diveT = CENTI_DIVE[0] + Math.random() * (CENTI_DIVE[1] - CENTI_DIVE[0]);
    e.warned = false;
    this.game.sfx.play('centiWarn', 0.7);
  }

  // 히트 앤 런 (§4-3)
  updateCentipede(e, world, dt, dxT, dyT, distT) {
    if (e.state === 'dive') {
      e.diveT -= dt;
      if (!e.warned && e.diveT < 0.4) { e.warned = true; this.game.sfx.play('centiWarn'); }
      if (e.diveT <= 0) {
        const p = this.game.player;
        const dist = CENTI_RESURFACE[0] + Math.random() * (CENTI_RESURFACE[1] - CENTI_RESURFACE[0]);
        const a = Math.random() * Math.PI * 2;
        e.x = p.cx + Math.cos(a) * dist * TILE;
        e.y = p.cy + Math.sin(a) * dist * TILE;
        e.state = 'chase';
      }
      return;
    }
    const spd = ENEMY.centipede.speed;
    if (distT < 26) {
      const l = Math.hypot(dxT, dyT) || 1;
      e.x += (dxT / l) * spd;
      e.y += (dyT / l) * spd;
    } else {
      e.x += e.dir * spd * 0.4;
      if (solid(world, e.x + (e.dir > 0 ? e.w : 0), e.y + e.h / 2)) e.dir *= -1;
    }
  }

  /** 소나 대상 목록 */
  targets() {
    return this.list.map((e) => ({ id: e.id, x: e.x + e.w / 2, y: e.y + e.h / 2, kind: 'enemy', ref: e }));
  }

  draw(ctx, cam) {
    const p = this.game.player;
    for (const e of this.list) {
      const sx = Math.round(e.x - cam.x), sy = Math.round(e.y - cam.y);
      if (e.type === 'mole') {
        const d = Math.hypot(e.x - p.cx, e.y - p.cy) / TILE;
        if (e.inWall) {
          // 벽 속 반투명 실루엣은 3m 안에서만 보인다
          if (d > MOLE_SILHOUETTE) continue;
          ctx.globalAlpha = 0.45;
        }
      }
      if (e.state === 'dive') { ctx.globalAlpha = 0; continue; }
      ctx.fillStyle = e.hurtT > 0 ? '#ffffff' : this.color(e);
      switch (e.type) {
        case 'bat':
          ctx.fillRect(sx + 4, sy + 3, 6, 6);
          ctx.fillRect(sx, sy + 2 + Math.sin(e.t * 22) * 2, 4, 4);
          ctx.fillRect(sx + 10, sy + 2 - Math.sin(e.t * 22) * 2, 4, 4);
          break;
        case 'spider': case 'spiderling':
          ctx.fillRect(sx + 2, sy + 3, e.w - 4, e.h - 5);
          ctx.fillRect(sx, sy + 1, 2, 4);
          ctx.fillRect(sx + e.w - 2, sy + 1, 2, 4);
          if (e.state === 'hang') {
            ctx.strokeStyle = 'rgba(230,230,230,0.5)';
            ctx.beginPath();
            ctx.moveTo(sx + e.w / 2, sy);
            ctx.lineTo(sx + e.w / 2, sy - 10);
            ctx.stroke();
          }
          break;
        case 'centipede':
          for (let s = 0; s < 5; s++) {
            ctx.fillRect(sx + s * 6, sy + Math.sin(e.t * 8 + s) * 2, 5, e.h);
          }
          break;
        default:
          ctx.fillRect(sx, sy + 2, e.w, e.h - 2);
          ctx.fillRect(sx + (e.dir > 0 ? e.w - 3 : 0), sy, 3, 3);
      }
      // HP 바
      if (e.hp < e.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(sx, sy - 5, e.w, 3);
        ctx.fillStyle = '#e05050';
        ctx.fillRect(sx, sy - 5, (e.w * e.hp) / e.maxHp, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  color(e) {
    switch (e.type) {
      case 'ant': return '#8a4b2a';
      case 'bat': return '#5b4a6e';
      case 'spider': return '#2f2f3a';
      case 'spiderling': return '#48485a';
      case 'mole': return '#6b5a44';
      case 'centipede': return '#3f7a4a';
      default: return '#888';
    }
  }
}
