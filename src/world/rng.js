// 결정론 난수 · 노이즈 · 역CDF 균등화
//
// §11-1 함정 1: valueNoise/fbm은 균등난수의 가중합이라 0.5 근처에 몰린 종 모양
// 분포다. 확률 임계값에는 반드시 균등화된 값(uniformFbm3)을 써야 한다.

export function mulberry32(a) {
  let s = a >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 좌표 해시 — 애초에 균등분포. 정확한 비율이 필요한 판정은 이걸 쓴다.
export function ihash(x, y, seed) {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h ^ (y | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  // 32비트 주기를 늘리기 위한 두 번째 혼합 (§7-2 #3)
  h = Math.imul(h ^ Math.imul(y | 0, 0x165667b1), 0x2545f491);
  h ^= h >>> 15;
  return h >>> 0;
}

export function hash2(x, y, seed) {
  return ihash(x, y, seed) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

const W = [0.5, 0.3, 0.2];

export function fbm3(x, y, seed) {
  return (
    W[0] * valueNoise(x, y, seed) +
    W[1] * valueNoise(x * 2.03, y * 2.03, seed + 1013) +
    W[2] * valueNoise(x * 4.07, y * 4.07, seed + 2027)
  );
}

// ── 역CDF 균등화 LUT ─────────────────────────────────────────────
const Q = 65;
let LUT = null;

function buildLUT() {
  const N = 20000;
  const rnd = mulberry32(0x5eed1234);
  const vals = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const x = (rnd() - 0.5) * 4000;
    const y = (rnd() - 0.5) * 4000;
    vals[i] = fbm3(x, y, 777);
  }
  vals.sort();
  const lut = new Float64Array(Q);
  for (let i = 0; i < Q; i++) {
    const p = i / (Q - 1);
    const idx = Math.min(N - 1, Math.max(0, Math.round(p * (N - 1))));
    lut[i] = vals[idx];
  }
  // 단조 증가 보정
  for (let i = 1; i < Q; i++) if (lut[i] <= lut[i - 1]) lut[i] = lut[i - 1] + 1e-9;
  return lut;
}

export function equalize(v) {
  if (!LUT) LUT = buildLUT();
  if (v <= LUT[0]) return 0;
  if (v >= LUT[Q - 1]) return 0.9999999;
  let lo = 0, hi = Q - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (LUT[mid] <= v) lo = mid; else hi = mid;
  }
  const t = (v - LUT[lo]) / (LUT[hi] - LUT[lo]);
  return (lo + t) / (Q - 1);
}

/** [0,1) 균등분포 fbm. 확률 임계값·CDF 매핑에는 반드시 이것을 쓴다. */
export function uniformFbm3(x, y, seed) {
  return equalize(fbm3(x, y, seed));
}

/** 진단용 — 균등화 검증 (25~75 백분위가 0.25~0.75 근처인지) */
export function noiseQuantiles(fn, n = 8000) {
  const rnd = mulberry32(0xabcdef);
  const v = [];
  for (let i = 0; i < n; i++) v.push(fn((rnd() - 0.5) * 3000, (rnd() - 0.5) * 3000));
  v.sort((a, b) => a - b);
  const at = (p) => v[Math.floor(p * (n - 1))];
  return { p05: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95) };
}

export function randRange(rnd, a, b) {
  return a + rnd() * (b - a);
}
