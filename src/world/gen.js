// 절차 생성 — 순수 함수. 같은 좌표는 항상 같은 결과 (§11-2)
import { MAT, ORE, pack, matOf, isSolidMat, hardnessOf } from './tiles.js';
import { hash2, uniformFbm3 } from './rng.js';
import {
  WORLD_HALF_W, DEPTH_CAP_M, M_PER_TILE, CHUNK, SURFACE_FLAT_HALF_W, HOUSE_GROUND_PROTECT,
  HARDNESS_BANDS, ORE_TABLE, STATION_DEPTHS, STATION_SPACING_X,
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
    // 같은 깊이에 여러 대를 좌우로 산개한다. 한 층에 한 대뿐이면 800타일 폭에서
    // 찾을 방법이 사실상 없다 — 특히 정거장이 암반에 묻힌 뒤로는 더 그렇다.
    this.stations = [];
    const span = Math.floor((WORLD_HALF_W - 30) / STATION_SPACING_X);
    STATION_DEPTHS.forEach((m, i) => {
      const y = yOfDepth(m);
      for (let k = -span; k <= span; k++) {
        // 깊이마다 흔들어 수직으로 줄 서지 않게 한다
        const jitter = Math.round((hash2(i, k, this.seed + 91) * 2 - 1) * STATION_SPACING_X * 0.35);
        const x = k * STATION_SPACING_X + jitter;
        this.stations.push({ index: i + 1, sub: k, depthM: m, x, y });
      }
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
    if (ax <= SURFACE_FLAT_HALF_W) return 0;
    const n = uniformFbm3(x * 0.04, 0.5, this.seed + 7) * 10 - 3;
    const t = Math.min(1, (ax - SURFACE_FLAT_HALF_W) / 25);
    return Math.floor(n * t);
  }

  stationsNear(y) {
    return this.stationByChunkY.get(Math.floor(y / CHUNK)) || [];
  }

  /**
   * 정거장 구조물. −1 = 해당 없음, 그 외 = 타일값.
   * pack(MAT.AIR)이 0이라 예전처럼 0을 "해당 없음"으로 쓰면 빈 칸 지정이 falsy로
   * 묻혀 승강기 칸이 아예 파이지 않는다. travelTo로 내려오면 암반에 박힌다.
   * 예전에는 정거장 위로 15×5 방을 미리 파뒀다. 정거장도 파내서 찾는 것이 되도록
   * 방을 승강기 칸 크기(4×4)로 줄였다 — 사방이 암반이라 밖에서는 파내야 닿고,
   * 안은 비어 있어야 엘리베이터로 내려왔을 때(travelTo) 암반 속에 박히지 않는다.
   * 발판 폭도 구조물이 그려지는 s.x−2 ~ s.x+1로 줄였다. 불괴 재질인 발판을
   * 예전처럼 15칸 깔면 암반 속에 파낼 수 없는 가로벽이 생긴다 (§5-6).
   */
  stationTile(x, y) {
    for (const s of this.stationsNear(y)) {
      if (x < s.x - 2 || x > s.x + 1) continue;
      if (y === s.y + 1) return pack(MAT.STATION);
      if (y >= s.y - 3 && y <= s.y) return pack(MAT.AIR);
    }
    return -1;
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
    const hp = HOUSE_GROUND_PROTECT;
    if (x >= hp.x0 && x <= hp.x1 && y >= hp.y0 && y <= hp.y1) return pack(MAT.TUTWALL);

    const st = this.stationTile(x, y);
    if (st >= 0) return st;

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
