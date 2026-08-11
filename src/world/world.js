// 청크 캐시 · 런 단위 지형 변경분 · 청크 오프스크린 렌더 · 낙하블록
import { Gen, depthM } from './gen.js';
import {
  MAT, matOf, oreOf, pack, hardnessOf, isSolidMat, isLiquidMat,
  isDiggable, isBlastable, tileShade, oreColor, ORE_COLOR,
} from './tiles.js';
import { hash2 } from './rng.js';
import { CHUNK, TILE, ORE_TABLE } from '../data/balance.js';

const CH_PX = CHUNK * TILE;
const CACHE_MAX = 420;
// 물 흐름 — 발밑이 비면 내려가고, 막히면 "아래가 빈 옆칸"으로만 한 칸 옮긴다.
// 옆으로 갈 조건에 "그 칸의 아래도 비어 있어야" 한다는 제약이 있어 좌우로
// 무한히 왕복하지 않고, 물 타일 수도 늘지 않는다(자리를 옮길 뿐이다).
const WATER_TICK = 0.09;   // 초 — 흐름 갱신 간격
const WATER_BUDGET = 260;  // 한 번에 평가할 칸 수 상한
const QUEUE_CAP = 8000;

export function oreDrop(mat, ore) {
  if (!ore) return 0;
  const list = ORE_TABLE[hardnessOf(mat)] || [];
  const e = list.find((x) => x.ore === ore);
  return e ? e.drop : 0;
}

export class World {
  constructor(seed) {
    this.gen = new Gen(seed);
    this.chunks = new Map();
    this.lru = [];
    /** 런 단위 변경분 — 청크 캐시와 별도로 보관해야 LRU 축출 시 지형이 복구되지 않는다 */
    this.edits = new Map();
    this.falling = [];
    this.checkQueue = [];
    this.waterQueue = [];
    this.waterT = 0;
    this.onBreak = null; // (x,y,mat,ore) => void
  }

  reset() {
    this.chunks.clear();
    this.lru.length = 0;
    this.edits.clear();
    this.falling.length = 0;
    this.checkQueue.length = 0;
    this.waterQueue.length = 0;
    this.waterT = 0;
  }

  // ── 청크 ───────────────────────────────────────────────────────
  chunkKey(cx, cy) { return cx + ',' + cy; }

  chunk(cx, cy) {
    const k = this.chunkKey(cx, cy);
    let ch = this.chunks.get(k);
    if (ch) return ch;
    const mats = new Uint8Array(CHUNK * CHUNK);
    const ores = new Uint8Array(CHUNK * CHUNK);
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const t = this.gen.tileAt(cx * CHUNK + tx, cy * CHUNK + ty);
        const i = ty * CHUNK + tx;
        mats[i] = matOf(t);
        ores[i] = oreOf(t);
      }
    }
    ch = { cx, cy, mats, ores, canvas: null, dirty: true };
    this.chunks.set(k, ch);
    this.lru.push(k);
    if (this.lru.length > CACHE_MAX) {
      const old = this.lru.shift();
      if (old !== k) this.chunks.delete(old);
    }
    return ch;
  }

  editKey(x, y) { return x + ',' + y; }

  get(x, y) {
    const e = this.edits.get(this.editKey(x, y));
    if (e !== undefined) return e;
    // Math.floor 사용 — 비트시프트는 깊이 10억 m에서 부호가 뒤집힌다 (§7-2)
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    const ch = this.chunk(cx, cy);
    const i = (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK);
    return pack(ch.mats[i], ch.ores[i]);
  }

  mat(x, y) { return matOf(this.get(x, y)); }
  ore(x, y) { return oreOf(this.get(x, y)); }
  hardness(x, y) { return hardnessOf(this.mat(x, y)); }
  isSolid(x, y) { return isSolidMat(this.mat(x, y)); }
  isLiquid(x, y) { return isLiquidMat(this.mat(x, y)); }
  isAir(x, y) { return this.mat(x, y) === MAT.AIR; }

  set(x, y, t) {
    this.edits.set(this.editKey(x, y), t);
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    const k = this.chunkKey(cx, cy);
    const ch = this.chunks.get(k);
    if (ch) {
      const i = (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK);
      ch.mats[i] = matOf(t);
      ch.ores[i] = oreOf(t);
      ch.dirty = true;
    }
    // 이웃 청크의 상단 하이라이트가 바뀔 수 있다
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = this.chunks.get(this.chunkKey(Math.floor((x + dx) / CHUNK), Math.floor((y + dy) / CHUNK)));
      if (n && n !== ch) n.dirty = true;
    }
  }

  /**
   * 타일 파괴. blast=true면 보강벽도 부순다.
   * @returns {{mat:number, ore:number, drop:number}|null}
   */
  breakTile(x, y, blast = false) {
    const t = this.get(x, y);
    const m = matOf(t);
    const ok = blast ? isBlastable(m) : isDiggable(m);
    if (!ok) return null;
    const o = oreOf(t);
    this.set(x, y, pack(MAT.AIR));
    this.disturb(x, y);
    const drop = oreDrop(m, o);
    if (this.onBreak) this.onBreak(x, y, m, o);
    return { mat: m, ore: o, drop };
  }

  /** 주변 낙하블록 · 물 재평가 예약 */
  disturb(x, y) {
    for (let dy = -3; dy <= 0; dy++) {
      for (let dx = -1; dx <= 1; dx++) this.checkQueue.push([x + dx, y + dy]);
    }
    this.wake(x, y);
  }

  /** 이 칸과 주변 물을 다시 흐르게 한다 */
  wake(x, y) {
    if (this.waterQueue.length > QUEUE_CAP) return;
    for (let dy = -2; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) this.waterQueue.push([x + dx, y + dy]);
    }
  }

  /**
   * 물 한 칸의 이동. 아래가 비면 내려가고, 막히면 아래가 빈 옆칸으로 옮긴다.
   * @returns {boolean} 움직였는가
   */
  waterStep(x, y) {
    if (this.mat(x, y) !== MAT.WATER) return false;
    const move = (nx, ny) => {
      this.set(nx, ny, pack(MAT.WATER));
      this.set(x, y, pack(MAT.AIR));
      this.wake(x, y);
      this.wake(nx, ny);
      // 물이 빠진 자리 위의 모래도 다시 평가한다
      this.checkQueue.push([x, y - 1], [x - 1, y - 1], [x + 1, y - 1]);
      return true;
    };
    if (this.mat(x, y + 1) === MAT.AIR) return move(x, y + 1);
    // 좌우 우선순위를 좌표로 갈라 한쪽으로만 쏠리지 않게 한다
    const dirs = ((x + y) & 1) ? [1, -1] : [-1, 1];
    for (const dx of dirs) {
      if (this.mat(x + dx, y) === MAT.AIR && this.mat(x + dx, y + 1) === MAT.AIR) {
        return move(x + dx, y);
      }
    }
    return false;
  }

  updateWater(dt) {
    this.waterT -= dt;
    if (this.waterT > 0) return;
    this.waterT = WATER_TICK;
    // 이번 틱에 평가할 칸을 따로 떼어낸다. waterStep이 깨우는 칸을 같은 루프에서
    // 다시 처리하면 물이 한 틱에 수십 칸을 흘러가 순간이동처럼 보인다.
    const batch = this.waterQueue;
    this.waterQueue = [];
    let n = 0;
    while (batch.length && n++ < WATER_BUDGET) {
      const [x, y] = batch.pop();
      this.waterStep(x, y);
    }
    // 예산을 넘긴 나머지는 다음 틱으로 넘긴다
    for (const c of batch) {
      if (this.waterQueue.length > QUEUE_CAP) break;
      this.waterQueue.push(c);
    }
  }

  // ── 낙하블록 (모래암반) · 물 ───────────────────────────────────
  updateFalling(dt, onLand) {
    this.updateWater(dt);
    let n = 0;
    while (this.checkQueue.length && n++ < 400) {
      const [x, y] = this.checkQueue.pop();
      if (this.mat(x, y) !== MAT.SAND) continue;
      const below = this.mat(x, y + 1);
      if (below === MAT.AIR || isLiquidMat(below)) {
        this.set(x, y, pack(MAT.AIR));
        this.falling.push({ x: x * TILE, y: y * TILE, vy: 0.5, mat: MAT.SAND });
        this.checkQueue.push([x, y - 1], [x - 1, y - 1], [x + 1, y - 1]);
      }
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.vy = Math.min(f.vy + 0.55, 10);
      const ny = f.y + f.vy;
      const tx = Math.floor(f.x / TILE);
      const bottomTile = Math.floor((ny + TILE - 0.01) / TILE);
      if (this.isSolid(tx, bottomTile)) {
        const rest = bottomTile - 1;
        f.landed = true;
        this.set(tx, rest, pack(MAT.SAND));
        this.disturb(tx, rest);
        if (onLand) onLand(tx, rest, f);
        this.falling.splice(i, 1);
        continue;
      }
      f.y = ny;
      if (onLand) onLand(tx, Math.floor(f.y / TILE), f, true);
    }
  }

  // ── 렌더 ───────────────────────────────────────────────────────
  renderChunk(ch) {
    if (!ch.canvas) {
      ch.canvas = document.createElement('canvas');
      ch.canvas.width = CH_PX;
      ch.canvas.height = CH_PX;
    }
    const c = ch.canvas.getContext('2d');
    c.clearRect(0, 0, CH_PX, CH_PX);
    const bx = ch.cx * CHUNK, by = ch.cy * CHUNK;
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const i = ty * CHUNK + tx;
        const m = ch.mats[i];
        if (m === MAT.AIR) continue;
        const wx = bx + tx, wy = by + ty;
        const px = tx * TILE, py = ty * TILE;

        if (m === MAT.WATER || m === MAT.LAVA) {
          c.globalAlpha = m === MAT.WATER ? 0.62 : 0.92;
          c.fillStyle = tileShade(m, wx, wy);
          c.fillRect(px, py, TILE, TILE);
          c.globalAlpha = 1;
          if (matOf(this.get(wx, wy - 1)) === MAT.AIR) {
            c.fillStyle = m === MAT.WATER ? 'rgba(190,230,255,0.55)' : 'rgba(255,220,140,0.75)';
            c.fillRect(px, py, TILE, 3);
          }
          if (m === MAT.LAVA) {
            // 용암은 스스로 빛난다 (§4-2)
            c.fillStyle = 'rgba(255,150,40,0.16)';
            c.fillRect(px - 6, py - 6, TILE + 12, TILE + 12);
          }
          continue;
        }

        c.fillStyle = tileShade(m, wx, wy);
        c.fillRect(px, py, TILE, TILE);
        if (matOf(this.get(wx, wy - 1)) === MAT.AIR) {
          c.fillStyle = 'rgba(255,255,255,0.10)';
          c.fillRect(px, py, TILE, 3);
        }
        c.fillStyle = 'rgba(0,0,0,0.16)';
        c.fillRect(px, py + TILE - 2, TILE, 2);

        if (m === MAT.STATION) {
          c.fillStyle = '#8ea0c8';
          c.fillRect(px + 2, py + 4, TILE - 4, 3);
        }
        if (m === MAT.DYNAMITE) {
          c.fillStyle = '#f0d060';
          c.fillRect(px + 6, py + 1, 4, 4);
        }
        if (m === MAT.REINFORCED || m === MAT.TUTWALL) {
          // 불괴 재질임을 보여주는 테두리 — 흙·돌과 확실히 구별돼야 한다
          c.strokeStyle = 'rgba(150,160,190,0.45)';
          c.lineWidth = 1;
          c.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
        }

        const o = ch.ores[i];
        if (o) {
          const col = ORE_COLOR[o];
          for (let k = 0; k < 3; k++) {
            const ox = 2 + Math.floor(hash2(wx, wy * 7 + k, 0x0e) * 9);
            const oy = 2 + Math.floor(hash2(wx * 5 + k, wy, 0x0f) * 9);
            const s = 3 + Math.floor(hash2(wx + k, wy + k, 0x10) * 3);
            c.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
            c.fillRect(px + ox, py + oy, s, s);
            c.fillStyle = 'rgba(255,255,255,0.35)';
            c.fillRect(px + ox, py + oy, s, 1);
          }
        }
      }
    }
    ch.dirty = false;
  }

  /** 카메라 상대 좌표로만 그린다 (§7-2 #1) */
  draw(ctx, cam) {
    const x0 = Math.floor(cam.x / CH_PX) - 1;
    const x1 = Math.floor((cam.x + cam.w) / CH_PX) + 1;
    const y0 = Math.floor(cam.y / CH_PX) - 1;
    const y1 = Math.floor((cam.y + cam.h) / CH_PX) + 1;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const ch = this.chunk(cx, cy);
        if (ch.dirty || !ch.canvas) this.renderChunk(ch);
        ctx.drawImage(ch.canvas, Math.round(cx * CH_PX - cam.x), Math.round(cy * CH_PX - cam.y));
      }
    }
    // 낙하 중인 모래
    for (const f of this.falling) {
      ctx.fillStyle = tileShade(MAT.SAND, Math.floor(f.x / TILE), Math.floor(f.y / TILE));
      ctx.fillRect(Math.round(f.x - cam.x), Math.round(f.y - cam.y), TILE, TILE);
    }
  }
}

export { depthM };
