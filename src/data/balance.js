// 계획서(개정 10차)의 모든 수치. 밸런싱은 이 파일만 고친다.

export const TILE = 16;
export const M_PER_TILE = 0.5;
export const CHUNK = 32;
export const WORLD_HALF_W = 400;
export const DEPTH_CAP_M = 1000000;
// 지상 스폰 근처 평지 폭(타일) — 이 안쪽은 지표면 높이를 0으로 고정한다
export const SURFACE_FLAT_HALF_W = 40;
// 집 주변 지상 타일은 파괴 불가 — 엘리베이터로 올라올 때 자기가 파 놓은
// 갱도로 떨어지는 일이 없게 한다. entity/objects.js의 HOUSE와 좌표를 맞춘다.
export const HOUSE_GROUND_PROTECT = { x0: 2, y0: 0, x1: 13, y1: 1 };

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
// 레벨 캡 5→8 (§7 확장). 최고 레벨이 예전보다 세지면 안 되므로, 예전 Lv5의
// 수치가 새 Lv8(최고 레벨)의 수치가 되도록 전체 곡선을 눌러 담았다 — 그만큼
// 한 단계의 상승폭은 작아지고, 8단계를 다 올려도 예전 만렙과 같은 세기다.
export const LEVEL_CAP = 8;
export const PICK_CD = [0.45, 0.41, 0.37, 0.33, 0.30, 0.26, 0.22, 0.18];
export const PICK_REACH = 5; // 타일
// 커서 주변 공격 반경. 파괴 대상이 없어도(공중의 박쥐 등) 이 원 안의 적은 맞는다.
// 적 히트박스 여유(ENEMY_HIT_PAD)와 합쳐지므로 실제 체감은 이보다 넉넉하다.
export const PICK_HIT_R = 22; // px
// 등급 1~8 + 9(플래그 버프). 버프 수치는 예전 그대로 — "예전 만렙+1단" 그 자체다.
export const GRADE_DMG = [1, 1, 1, 2, 2, 2, 3, 3, 4];
export const ITEM_DMG = [2, 2, 2, 3, 3, 3, 4, 4, 5]; // 폭탄·드릴·레이저 Lv1~8 + 9(버프)

export const clinicCap = (grade) => 50 * Math.pow(5, grade - 1);
export const clinicCost = (n, grade) => Math.min(5 * Math.pow(2, n - 1), clinicCap(grade));
export const bankFeeRate = (grade) => grade / 100;

// ── 소나 (§3-3) ──────────────────────────────────────────────────
// 반경은 계획서 값(16·20·24·28·30타일)의 0.5배다. Lv1이 4m로 좁아지고,
// 계획서의 Lv1 범위(8m)는 예전 Lv5(7.5m)에 가서야 나온다.
// 쿨다운은 그대로. 여기만 고치면 HUD·상점 표기도 함께 따라온다.
// 레벨 캡 5→8 확장 — 예전 Lv5(반경15·쿨1.5s)가 새 Lv8이 되도록 곡선을 눌렀다.
export const SONAR = [
  { r: 8, cd: 7.0 },
  { r: 9, cd: 6.2 },
  { r: 10, cd: 5.4 },
  { r: 11, cd: 4.6 },
  { r: 12, cd: 3.9 },
  { r: 13, cd: 3.1 },
  { r: 14, cd: 2.3 },
  { r: 15, cd: 1.5 },
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
// 인덱스는 Lv1~8 + 9(플래그 버프). 레벨 캡 5→8 확장 — 예전 Lv5 수치가 새
// Lv8(최고 레벨)이 되도록 곡선을 눌러 담았다. 버프(9번째) 수치는 예전과
// 동일한 절대값을 그대로 쓴다 — "만렙+1단"이라는 의미가 바뀌지 않는다.
export const BOMB = {
  radius: [2, 2.43, 2.86, 3.29, 3.71, 4.14, 4.57, 5, 5.75],
  oreBonus: [0, 0.07, 0.14, 0.21, 0.29, 0.36, 0.43, 0.5, 0.62],
  fuse: [2.0, 1.86, 1.71, 1.57, 1.43, 1.29, 1.14, 1.0, 0.75],
};
// 드릴·레이저는 경도를 무시한다 — maxHardness 개념이 없다 (기반암 등 원래 불괴인
// 재질만 beamTiles()가 막는다).
export const DRILL = {
  length: [6, 7, 9, 10, 12, 13, 15, 16, 19], // 굴착 사거리(타일) — 레벨만큼 늘어난다
  width: [1, 1, 2, 2, 2, 2, 3, 3, 4],
};
// 드릴은 아이템 개수가 아니라 충전(칸)이다 — 홀드하는 동안 1초에 1칸씩 소모된다.
// 최대 충전량도 레벨에 비례해 1→3칸으로 늘어난다 (§5-2).
export const DRILL_DRAIN_SEC = 1;
export const DRILL_CHARGE_MAX = [1, 1, 2, 2, 2, 3, 3, 3];
export const LASER = {
  range: [10, 12, 14, 16, 18, 20, 22, 24, 28],
  width: [1, 1, 2, 2, 2, 2, 3, 3, 4],
  oreBonus: [0.25, 0.36, 0.46, 0.57, 0.68, 0.79, 0.89, 1.0, 1.19],
  cd: 0.35,
};
export const FLAG = {
  heal: [1, 1, 1, 1, 2, 2, 2, 2],
  buffSec: [60, 77, 94, 111, 129, 146, 163, 180],
  sonarBonusM: [0, 1, 3, 4, 6, 7, 9, 10],
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
// 속도는 계획서 값(1.1·1.6·1.0·1.3·2.0)의 0.6배다. 플레이어 이동 속도가 2.6이라
// 예전에는 지네(2.0)·박쥐 돌진(3.0)이 도망칠 수 없을 만큼 빨랐다.
export const ENEMY = {
  ant: { hp: 1, minH: 1, speed: 0.66 },
  bat: { hp: 2, minH: 1, speed: 0.96 },
  spider: { hp: 3, minH: 1, speed: 0.6 },
  spiderling: { hp: 1, minH: 1, speed: 0.78 },
  mole: { hp: 2, minH: 2, speed: 0 },
  centipede: { hp: 6, minH: 3, speed: 1.2 },
};
export const MOLE_STEP_PX = 42; // 소리를 쫓는 두더지의 초당 이동 상한 (70의 0.6배)
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
// 레벨 캡 5→8(§7)에 맞춰 7칸(Lv1→2 ... Lv7→8)으로 늘었다. 마지막 한 단(Lv7→8)은
// 만렙을 찍는 값이니 3~5백금(3000~5000구리)이 들도록 곡선의 끝을 다시 맞췄다 —
// 곡괭이 속도·범위가 5백금, 소나가 4백금, 폭탄·드릴·레이저·플래그가 3백금.
export const PRICES = {
  pickSpeed: [8, 25, 70, 200, 580, 1700, 5000],
  pickRange: [8, 25, 70, 200, 580, 1700, 5000],
  sonar: [8, 22, 60, 170, 480, 1350, 4000],
  grapple: [50, 200, 800],
  bomb: [5, 14, 40, 115, 330, 950, 3000],
  drill: [5, 14, 40, 115, 330, 950, 3000],
  laser: [5, 14, 40, 115, 330, 950, 3000],
  flag: [5, 14, 40, 115, 330, 950, 3000],
  maxHp: [500, 2000],
};
export const SHOP_PRICE = { bomb: 50, drill: 800, laser: 100, flag: 120 }; // 5은 · 8금 · 1금 · 1금2은
export const SELL_RATE = 0.5;

// 경도 체계가 한 단계씩 올랐으므로(tiles.js) 등급 게이트도 같이 밀었다 —
// 여전히 "돌 있어야 희귀, 경암 있어야 전설"과 같은 의미다.
// 상자 내용물 — 폭탄·드릴·레이저는 자주, 플래그는 드물게 나온다.
export const ITEM_DROP_WEIGHTS = { bomb: 3, drill: 3, laser: 3, flag: 1 };
// 포션은 예전엔 등급 불문 무조건 +1이었다 — 이제는 이 확률로만 나온다.
export const POTION_DROP_CHANCE = 0.5;

export const CHEST_GRADES = [
  { grade: 1, name: '일반', p: 0.5, minH: 2 },
  { grade: 2, name: '희귀', p: 0.3, minH: 3 },
  { grade: 3, name: '전설', p: 0.2, minH: 4 },
];

// 청크당 등장 확률 — 고양이는 보물상자의 80% 밀도 (§5-4)
export const CHEST_DENSITY = 0.6;
export const CAT_DENSITY = CHEST_DENSITY * 0.8;
export const CAT_CARRY_MAX = 3;
// 인계 보너스 — 한 번에 데려온 마리수만큼 배율이 붙는다 (§5-4)
export const CAT_BASE_REWARD = 10;
export const CAT_BATCH_BONUS = 0.25;

// ── 정거장 (§5-6) ────────────────────────────────────────────────
// 간격(n) = min(50 × 1.15^(n−2), 300) 을 5m 단위로 정리한 값이 계획서 표다.
// 곡선을 다시 계산하면 표와 1~5m씩 어긋나므로 E1~E14는 표를 그대로 쓰고,
// E15부터 +300m씩 이어간다.
const STATION_TABLE = [50, 100, 160, 225, 300, 385, 490, 605, 735, 890, 1065, 1270, 1500, 1770];

// 같은 깊이에 정거장을 좌우로 몇 타일 간격으로 놓을지. 값을 줄이면 더 촘촘해진다.
// 폭 800타일에 한 층당 약 (800 / 이 값) 대가 생긴다.
export const STATION_SPACING_X = 60;

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
