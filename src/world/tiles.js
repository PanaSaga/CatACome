// 타일 정의. 한 타일은 16비트: 하위 4비트 = 재질, 상위 = 광맥
import { hash2 } from './rng.js';

export const MAT = {
  AIR: 0,
  DIRT: 1,
  STONE: 2,
  HARD: 3,
  OBS: 4,
  BEDROCK: 5,
  WATER: 6,
  LAVA: 7,
  SAND: 8,
  DYNAMITE: 9,
  REINFORCED: 10, // 폭발로만 파괴 (§9 원격 마커 보강 발판)
  TUTWALL: 11,    // 완전 불괴 (집 주변 지상 보호)
  STATION: 12,    // 정거장 구조물
};

export const ORE = { NONE: 0, COPPER: 1, SILVER: 2, GOLD: 3 };

export const pack = (mat, ore = 0) => (mat & 15) | (ore << 4);
export const matOf = (t) => t & 15;
export const oreOf = (t) => t >> 4;

const HARDNESS = {
  [MAT.AIR]: 0,
  [MAT.DIRT]: 1,
  [MAT.STONE]: 2,
  [MAT.HARD]: 3,
  [MAT.OBS]: 4,
  [MAT.BEDROCK]: Infinity,
  [MAT.WATER]: 0,
  [MAT.LAVA]: 0,
  [MAT.SAND]: 2,
  [MAT.DYNAMITE]: 1,
  [MAT.REINFORCED]: Infinity,
  [MAT.TUTWALL]: Infinity,
  [MAT.STATION]: Infinity,
};

export const hardnessOf = (mat) => HARDNESS[mat] ?? 0;

const SOLID = new Set([
  MAT.DIRT, MAT.STONE, MAT.HARD, MAT.OBS, MAT.BEDROCK,
  MAT.SAND, MAT.DYNAMITE, MAT.REINFORCED, MAT.TUTWALL, MAT.STATION,
]);
export const isSolidMat = (mat) => SOLID.has(mat);
export const isLiquidMat = (mat) => mat === MAT.WATER || mat === MAT.LAVA;

/** 곡괭이·드릴·레이저로 파괴 가능한가 */
export const isDiggable = (mat) => SOLID.has(mat) && Number.isFinite(HARDNESS[mat]);
/** 폭발로 파괴 가능한가 — 보강벽(REINFORCED)은 폭발에만 부서진다 */
export const isBlastable = (mat) => isDiggable(mat) || mat === MAT.REINFORCED;

// ── 색 ───────────────────────────────────────────────────────────
export const MAT_COLOR = {
  [MAT.DIRT]: [0x6d, 0x4c, 0x30],
  [MAT.STONE]: [0x79, 0x79, 0x82],
  [MAT.HARD]: [0x53, 0x53, 0x5e],
  [MAT.OBS]: [0x2d, 0x24, 0x36],
  [MAT.BEDROCK]: [0x15, 0x15, 0x1a],
  [MAT.WATER]: [0x25, 0x67, 0xa8],
  [MAT.LAVA]: [0xe2, 0x66, 0x28],
  [MAT.SAND]: [0xb5, 0x97, 0x5c],
  [MAT.DYNAMITE]: [0xa8, 0x33, 0x30],
  [MAT.REINFORCED]: [0x44, 0x3f, 0x52],
  [MAT.TUTWALL]: [0x39, 0x3e, 0x4d],
  [MAT.STATION]: [0xc9, 0xcd, 0xd8],
};

export const ORE_COLOR = {
  [ORE.COPPER]: [0xd0, 0x77, 0x38],
  [ORE.SILVER]: [0xd8, 0xe0, 0xe8],
  [ORE.GOLD]: [0xf5, 0xc7, 0x36],
};

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** 타일마다 미세한 명암 변화를 줘서 단색 블록처럼 보이지 않게 한다 */
export function tileShade(mat, x, y) {
  const base = MAT_COLOR[mat];
  if (!base) return '#000';
  const j = (hash2(x, y, 0x7a17) - 0.5) * 22;
  return `rgb(${clamp255(base[0] + j)},${clamp255(base[1] + j)},${clamp255(base[2] + j)})`;
}

export function oreColor(ore) {
  const c = ORE_COLOR[ore];
  return c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#000';
}

export const MAT_NAME = {
  [MAT.DIRT]: '흙', [MAT.STONE]: '돌', [MAT.HARD]: '경암', [MAT.OBS]: '흑요석',
  [MAT.BEDROCK]: '기반암', [MAT.WATER]: '지하수', [MAT.LAVA]: '용암',
  [MAT.SAND]: '모래암반', [MAT.DYNAMITE]: '다이너마이트',
  [MAT.REINFORCED]: '보강벽', [MAT.TUTWALL]: '불괴벽', [MAT.STATION]: '정거장',
};
