// 절차 생성 — 순수 함수. 같은 좌표는 항상 같은 결과 (§11-2)
import { MAT, ORE, pack, matOf, isSolidMat, hardnessOf } from './tiles.js';
import { hash2, uniformFbm3 } from './rng.js';
import { tutorialOwns, tutorialTile, TUT_HALF_W } from './tutorial.js';
import {
  WORLD_HALF_W, DEPTH_CAP_M, M_PER_TILE, CHUNK,
  HARDNESS_BANDS, ORE_TABLE, STATION_DEPTHS,
} from '../data/balance.js';

export const depthM = (y) => y * M_PER_TILE;
export const yOfDepth = (m) => Math.round(m / M_PER_TILE);

function bandWeights(m) {
  for (const b of HARDNESS_BANDS) if (m < b.maxM) return b.w;
  return HARDNESS_BANDS[HARDNESS_BANDS.length - 1].w;
}

const HARD_MAT = [MAT.DIRT, MAT.STONE, MAT.HARD, MAT.OBS];

export class Gen {
  constructor(seed) {
    this.seed = seed | 0;
    this.stations = STATION_DEPTHS.map((m, i) => {
      // E1은 튜토리얼 고정 배치와 좌표를 맞춘다 (§5-1)
      const x = i === 0 ? 31 : Math.round((hash2(i, 0, this.seed + 91) * 2 - 1) * 250);
      return { index: i + 1, depthM: m, x, y: yOfDepth(m) };
    });
    this.stationByChunkY = new Map();
    for (const s of this.stations) {
      for (let d = -1; d <= 1; d++) {
        const k = Math.floor(s.y / CHUNK) + d;
        if (!this.stationByChunkY.has(k)) this.stationByChunkY.set(k, []);
        this.stationByChunkY.get(k).push(s);
      }
    }
  }

  surfaceY(x) {
    const ax = Math.abs(x);
    if (ax <= TUT_HALF_W) return 0;
    const n = uniformFbm3(x * 0.04, 0.5, this.seed + 7) * 10 - 3;
    const t = Math.min(1, (ax - TUT_HALF_W) / 25);
    return Math.floor(n * t);
  }

  stationsNear(y) {
    return this.stationByChunkY.get(Math.floor(y / CHUNK)) || [];
  }

  /** 정거장 구조물. 0 = 해당 없음, 그 외 = 타일값 */
  stationTile(x, y) {
    for (const s of this.stationsNear(y)) {
      if (x < s.x - 7 || x > s.x + 7) continue;
      if (y === s.y + 1) return pack(MAT.STATION);
      if (y >= s.y - 4 && y <= s.y) return pack(MAT.AIR);
    }
    return 0;
  }

  /** 액체·다이너마이트를 제외한 기반 지형. 액체 판정이 이 함수를 재귀 없이 참조한다 */
  core(x, y) {
    if (y < this.surfaceY(x)) return { mat: MAT.AIR, h: 0, ore: 0 };
    const m = depthM(y);
    const caveThresh = y < 12 ? 0.92 : 0.74;
    if (uniformFbm3(x * 0.055, y * 0.055, this.seed + 11) > caveThresh) {
      return { mat: MAT.AIR, h: 0, ore: 0 };
    }
    // 경도 — 반드시 균등화된 노이즈로 CDF 매핑 (§11-1 함정 1)
    const w = bandWeights(m);
    const n = uniformFbm3(x * 0.085, y * 0.085, this.seed + 23) * 100;
    let acc = 0, h = 1;
    for (let i = 0; i < 4; i++) {
      acc += w[i];
      if (n < acc) { h = i + 1; break; }
      if (i === 3) h = 4;
    }
    // 모래암반 — 경도 2~3에만 (§4-2)
    if ((h === 2 || h === 3) && hash2(x, y, this.seed + 31) < 0.06) {
      return { mat: MAT.SAND, h: 2, ore: 0 };
    }
    // 광맥 — 정해진 경도 안에서만
    let ore = 0;
    const list = ORE_TABLE[h];
    if (list) {
      const r = hash2(x, y, this.seed + 41);
      let c = 0;
      for (const e of list) {
        c += e.rate;
        if (r < c) { ore = e.ore; break; }
      }
    }
    return { mat: HARD_MAT[h - 1], h, ore };
  }

  coreSolid(x, y) {
    return isSolidMat(this.core(x, y).mat);
  }

  tileAt(x, y) {
    if (x <= -WORLD_HALF_W || x >= WORLD_HALF_W) return pack(MAT.BEDROCK);
    if (depthM(y) >= DEPTH_CAP_M) return pack(MAT.BEDROCK);
    if (tutorialOwns(x, y)) return tutorialTile(x, y, this.seed);

    const st = this.stationTile(x, y);
    if (st) return st;

    const c = this.core(x, y);
    if (c.mat !== MAT.AIR) return pack(c.mat, c.ore);

    // ── 액체: 마스크를 "바닥 y" 기준으로 평가해야 공중에 뜬 물이 안 생긴다 (§11-1 함정 3)
    let fy = -1;
    for (let k = 1; k <= 8; k++) {
      if (this.coreSolid(x, y + k)) { fy = y + k; break; }
    }
    if (fy > 0 && y >= fy - 5) {
      const mask = uniformFbm3(x * 0.11, fy * 0.11, this.seed + 53);
      if (mask > 0.70) {
        const fh = this.core(x, fy).h;
        if (fh === 4) return pack(MAT.LAVA);
        if (fh <= 2 && depthM(y) >= 30) return pack(MAT.WATER);
      }
    }

    // 다이너마이트 — 바닥에 놓인 함정 (지표 근처에는 두지 않는다)
    if (fy === y + 1 && depthM(y) >= 20 && hash2(x, y, this.seed + 67) < 0.004) {
      return pack(MAT.DYNAMITE);
    }

    return pack(MAT.AIR);
  }

  hardnessAt(x, y) {
    return hardnessOf(matOf(this.tileAt(x, y)));
  }

  /** 상자 등급 판정용 — 주변 암반의 최대 경도 (§5-7) */
  maxHardnessAround(x, y, r = 3) {
    let mx = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const h = this.hardnessAt(x + dx, y + dy);
        if (Number.isFinite(h) && h > mx) mx = h;
      }
    }
    return mx;
  }
}
