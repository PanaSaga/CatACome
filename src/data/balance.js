// 계획서(개정 10차)의 모든 수치. 밸런싱은 이 파일만 고친다.

export const TILE = 16;
export const M_PER_TILE = 0.5;
export const CHUNK = 32;
export const WORLD_HALF_W = 400;
export const DEPTH_CAP_M = 1000000;

export const FPS = 60;
export const DT = 1 / FPS;

// 화면 확대 배율. 캔버스는 창 크기 그대로 쓰고 월드만 이 배율로 크게 그린다.
// 정수 배율이어야 fillRect 경계가 반픽셀에 걸리지 않아 도트가 깨지지 않는다.
export const ZOOM = 3;

// ── 경도 분포 (§3-2) ─────────────────────────────────────────────
export const HARDNESS_BANDS = [
  { maxM: 50, w: [85, 15, 0, 0] },
  { maxM: 100, w: [55, 45, 0, 0] },
  { maxM: 160, w: [25, 45, 28, 2] },
  { maxM: 300, w: [8, 32, 45, 15] },
  { maxM: 605, w: [0, 15, 45, 40] },
  { maxM: Infinity, w: [0, 5, 30, 65] },
];

// ── 광맥 (§3-2) ──────────────────────────────────────────────────
// [경도] = [{ ore, rate, drop }]
export const ORE_TABLE = {
  1: [{ ore: 1, rate: 0.04, drop: 2 }],
  2: [{ ore: 1, rate: 0.04, drop: 4 }, { ore: 2, rate: 0.005, drop: 20 }],
  3: [{ ore: 2, rate: 0.005, drop: 30 }, { ore: 3, rate: 0.005, drop: 70 }],
  4: [{ ore: 3, rate: 0.008, drop: 150 }],
};
export const ORE_NAME = { 1: '구리', 2: '은', 3: '금' };

// ── 곡괭이 (§3-1) ────────────────────────────────────────────────
export const PICK_CD = [0.45, 0.38, 0.30, 0.24, 0.18];
export const PICK_REACH = 5; // 타일
export const GRADE_DMG = [1, 1, 2, 2, 3, 4]; // 등급 1~5 + 6(플래그 버프)
export const ITEM_DMG = [2, 2, 3, 3, 4, 5]; // 폭탄·드릴·레이저 Lv1~5 + 6(버프)

export const clinicCap = (grade) => 50 * Math.pow(5, grade - 1);
export const clinicCost = (n, grade) => Math.min(5 * Math.pow(2, n - 1), clinicCap(grade));
export const bankFeeRate = (grade) => grade / 100;

// ── 소나 (§3-3) ──────────────────────────────────────────────────
export const SONAR = [
  { r: 16, cd: 7.0 },
  { r: 20, cd: 5.5 },
  { r: 24, cd: 4.0 },
  { r: 28, cd: 2.5 },
  { r: 30, cd: 1.5 },
];
export const SONAR_WAVE_TIME = 0.4;

// 감지된 대상(상자·고양이·정거장·플래그·적)의 표기.
// 핵은 그대로 두고, 그 자리에서 초음파처럼 링이 퍼져 나가 눈에 잡히게 한다.
export const MARK_R = 7;          // 핵 반지름 (월드 px)
export const MARK_SPREAD = 5;     // 링이 퍼지는 최대 배수 → 반지름 35px
export const MARK_RINGS = 3;      // 동시에 퍼지는 링 수
export const MARK_PULSE_T = 1.1;  // 링 한 겹이 끝까지 퍼지는 시간(초)
export const SONAR_MOLE_PULL = 3; // 타일

// ── 소모 아이템 (§3-4) ───────────────────────────────────────────
export const BOMB = {
  radius: [2, 2.75, 3.5, 4.25, 5, 5.75],
  oreBonus: [0, 0.12, 0.25, 0.38, 0.5, 0.62],
  fuse: [2.0, 1.75, 1.5, 1.25, 1.0, 0.75],
};
export const DRILL = {
  length: [6, 9, 11, 14, 16, 19],
  width: [1, 1, 2, 2, 3, 4],
  maxHardness: [2, 2, 3, 3, 4, 4],
  dps: ITEM_DMG,
};
export const LASER = {
  range: [10, 14, 17, 21, 24, 28],
  width: [1, 1, 2, 2, 3, 4],
  oreBonus: [0.25, 0.44, 0.63, 0.81, 1.0, 1.19],
  cd: 0.35,
};
export const FLAG = {
  heal: [1, 1, 1, 2, 2],
  buffSec: [60, 90, 120, 150, 180],
  sonarBonusM: [0, 2, 4, 6, 10],
  msgLen: 30,
};
export const POTION = { 1: { heal: 1, name: '하급' }, 2: { heal: 2, name: '중급' }, 3: { heal: 3, name: '상급' } };

// ── 갈고리 (§3-5) ────────────────────────────────────────────────
export const GRAPPLE_RANGE = [8, 10.5, 13, 16];
export const GRAPPLE_REEL_SPEED = 5.5; // px/frame

// ── 생존 (§4-1) ──────────────────────────────────────────────────
export const HP_LEVELS = [3, 4, 5];
export const INVULN = 1.2;
export const FALL_STEPS = [
  { tiles: 16, dmg: 1 },
  { tiles: 24, dmg: 2 },
  { tiles: 32, dmg: 3 },
];
export const BREATH_MAX = 15;
export const DROWN_GRACE = 3;
export const LAVA_TICK = 1.2;

// ── 적 (§4-3) ────────────────────────────────────────────────────
export const ENEMY = {
  ant: { hp: 1, minH: 1, speed: 1.1 },
  bat: { hp: 2, minH: 1, speed: 1.6 },
  spider: { hp: 3, minH: 1, speed: 1.0 },
  spiderling: { hp: 1, minH: 1, speed: 1.3 },
  mole: { hp: 2, minH: 2, speed: 0 },
  centipede: { hp: 6, minH: 3, speed: 2.0 },
};
// 공격 판정용 히트박스 여유. 적 몸집이 타일(16px)보다 작아서 정확히 겨누기 어려우니
// 피해 판정만 사방으로 넓힌다. 이동·접촉 피해·렌더는 원래 크기(SIZE)를 그대로 쓴다.
export const ENEMY_HIT_PAD = 6; // px
export const MOLE_HEAR = 14; // 타일 (7m)
export const MOLE_AUDIBLE = 15; // 15타일 (7.5m)
export const MOLE_SILHOUETTE = 6; // 6타일 (3m)
export const CENTI_DIVE = [4, 6];
export const CENTI_RESURFACE = [5, 8];

// ── 함정 (§4-2) ──────────────────────────────────────────────────
export const DYNAMITE = { fuse: 1.5, radius: 3, chain: 3, gap: 0.8, enemyDmg: 5 };

// ── 진행 (§5) ────────────────────────────────────────────────────
export const PRICES = {
  pickSpeed: [8, 40, 200, 1000],
  pickRange: [8, 40, 200, 1000],
  sonar: [8, 32, 128, 500],
  grapple: [50, 200, 800],
  bomb: [5, 20, 80, 320],
  drill: [5, 20, 80, 320],
  laser: [5, 20, 80, 320],
  flag: [5, 20, 80, 320],
  maxHp: [500, 2000],
};
export const SHOP_PRICE = { bomb: 8, drill: 25, laser: 40, flag: 15 };
export const SELL_RATE = 0.5;

export const CHEST_GRADES = [
  { grade: 1, name: '일반', p: 0.5, minH: 1 },
  { grade: 2, name: '희귀', p: 0.3, minH: 2 },
  { grade: 3, name: '전설', p: 0.2, minH: 3 },
];

export const CAT_SPACING_M = [20, 30];

// ── 정거장 (§5-6) ────────────────────────────────────────────────
// 간격(n) = min(50 × 1.15^(n−2), 300) 을 5m 단위로 정리한 값이 계획서 표다.
// 곡선을 다시 계산하면 표와 1~5m씩 어긋나므로 E1~E14는 표를 그대로 쓰고,
// E15부터 +300m씩 이어간다.
const STATION_TABLE = [50, 100, 160, 225, 300, 385, 490, 605, 735, 890, 1065, 1270, 1500, 1770];

export function stationDepths(count = 40) {
  const out = STATION_TABLE.slice(0, count);
  while (out.length < count) out.push(out[out.length - 1] + 300);
  return out;
}
export const STATION_DEPTHS = stationDepths();

// ── 배경 (§7-3) ──────────────────────────────────────────────────
// 배경은 파낸 공간(빈 곳)에 그대로 보이는 색이다. 채도·명도를 낮게 잡아야
// 공동이 "풀밭"이 아니라 "빈 굴"로 읽힌다.
export const BG_STOPS = [
  { m: 0, c: [0x3c, 0x4e, 0x31] },
  { m: 50, c: [0x33, 0x3f, 0x28] },
  { m: 160, c: [0x36, 0x28, 0x1b] },
  { m: 400, c: [0x20, 0x17, 0x11] },
  { m: 700, c: [0x10, 0x0d, 0x0a] },
  { m: 1000, c: [0x07, 0x06, 0x06] },
];
export const SKY = '#7ec8f0';
export const SKY_LOW = '#bfe4f7';

// ── 소나 색 (§3-3) ───────────────────────────────────────────────
export const SONAR_COLOR = {
  cat: '#57e36b',
  flag: '#4aa8ff',
  corpse: '#ffe14a',
  chest: '#ff9a3c',
  station: '#ffffff',
  enemy: '#ff4a4a',
};

export const START_BOMBS = 3;

export function currencyText(copper) {
  const c = Math.max(0, Math.floor(copper));
  const pt = Math.floor(c / 1000);
  const g = Math.floor((c % 1000) / 100);
  const s = Math.floor((c % 100) / 10);
  const cu = c % 10;
  const parts = [];
  if (pt) parts.push(`${pt}백금`);
  if (g) parts.push(`${g}금`);
  if (s) parts.push(`${s}은`);
  if (cu || parts.length === 0) parts.push(`${cu}구리`);
  return parts.join(' ');
}
