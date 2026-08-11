// 첫 50m — 시드 무관 고정 배치 (§5-1)
// 타일 좌표: y = 깊이(m) × 2. 0~101 · |x| ≤ 40 을 이 모듈이 전담한다.
import { MAT, ORE, pack } from './tiles.js';
import { hash2 } from './rng.js';

export const TUT_MAX_Y = 101;
export const TUT_HALF_W = 40;

export function tutorialOwns(x, y) {
  return y >= 0 && y <= TUT_MAX_Y && x >= -TUT_HALF_W && x <= TUT_HALF_W;
}

const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** −20m 갈고리 공동의 안전지대 (§5-1 B-1) — 낙하 피해 0, 발판으로 자동 복귀 */
export const SAFE_ZONE = { x0: -10, y0: 53, x1: 10, y1: 56 };
export const SAFE_RESPAWN = { x: 0, y: 41 }; // 발판 위 (타일)

// 상자·고양이는 방 바닥 아래 암반에 묻어 둔다. 손이 닿는 거리(2.5타일) 밖이라
// 반드시 파내야 하고, 그 칸 자체는 blocksTile()이 지켜서 사라지지 않는다.
export const TUT_SPAWNS = {
  bat: [{ x: 0, y: 25 }],
  mole: [{ x: 18, y: 90 }],
  // 고양이는 방 왼쪽 벽 3칸 안쪽 — 선 자리에서 수평으로 파 들어가 업을 수 있다.
  // (방 아래는 E1 정거장 방이라 파묻을 암반이 없다)
  cat: [{ x: 30, y: 95 }],
  chest: [{ x: 13, y: 67, grade: 1, tutorial: true }],
};

/** 튜토리얼 안내 문구 — 깊이(m)에 따라 표시 */
export const TUT_HINTS = [
  { m: 0, text: 'E로 집에 들어간다. A/D로 집 왼쪽까지 걸어가서, 커서를 발밑에 두고 좌클릭으로 땅을 파라. (집 주변 땅은 파이지 않는다)' },
  { m: 3, text: '아래로 파 내려가라. 구리 광맥이 보이면 함께 부숴 재화를 얻는다.' },
  { m: 11, text: '박쥐다. 좌클릭 곡괭이로 때려 쫓아내라.' },
  { m: 15, text: '돌(경도 2)은 Lv1 곡괭이로 두 번 때려야 부서진다.' },
  { m: 19, text: '공동이다. Shift 또는 우클릭으로 갈고리를 쏴 오른쪽 선반에 붙어라. 떨어져도 다치지 않는다.' },
  { m: 28, text: '보강벽은 곡괭이로 안 부서진다. 2번 슬롯 폭탄을 던져라.' },
  { m: 30, text: '보물상자는 바닥 아래 묻혀 있다. 상자가 보이는 곳까지 파 내려가서 E로 열어라.' },
  { m: 32, text: '경암 구간이다. 3번 드릴이나 4번 레이저가 훨씬 빠르다.' },
  { m: 39, text: '물이다. 숨 게이지를 보고, Space 연타로 떠올라라.' },
  { m: 42, text: '모래암반은 아래를 파면 무너진다. 머리 위 2칸이 쌓이면 매몰된다.' },
  { m: 45, text: '두더지는 소리를 쫓는다. 곡괭이질을 멈추면 두더지도 멈춘다.' },
  { m: 47, text: 'R로 소나를 쏴서 초록빛 고양이를 찾아라. 고양이도 묻혀 있으니 파낸 뒤 E로 업는다.' },
  { m: 49, text: 'E1 정거장이다. E로 고양이를 인계하고 지상으로 올라가 업그레이드를 사라.' },
];

export function tutorialTile(x, y, seed) {
  if (!tutorialOwns(x, y)) return -1;

  // 집과 그 주변 지상 타일은 파괴 대상에서 제외 (§5-5)
  if (rect(x, y, 2, 0, 13, 1)) return pack(MAT.TUTWALL);

  // −8m 구리 광맥 5덩이 보장
  if (rect(x, y, -5, 14, 5, 18) && hash2(x, y, seed + 3) < 0.15) {
    return pack(MAT.DIRT, ORE.COPPER);
  }

  // 기본 채움 — 0~50m 경도 분포 (§3-2)
  let m = hash2(x, y, seed + 5) < (y < 100 ? 0.85 : 0.55) ? MAT.DIRT : MAT.STONE;

  // −12m 박쥐 방
  if (rect(x, y, -5, 21, 5, 26)) m = MAT.AIR;

  // −16m 돌벽 (경도 개념)
  if (rect(x, y, -12, 30, 12, 32)) m = MAT.STONE;

  // −20m 갈고리 전용 수직 공동 — 벽은 완전 불괴라 갈고리 외 우회로가 없다
  if (rect(x, y, -11, 40, 11, 58)) m = MAT.TUTWALL;
  if (rect(x, y, -2, 40, 2, 40)) m = MAT.AIR;      // 진입구
  if (rect(x, y, -10, 41, 10, 56)) m = MAT.AIR;    // 공동 내부
  if (rect(x, y, -3, 42, 3, 42)) m = MAT.TUTWALL;  // 출발 발판
  if (rect(x, y, 5, 44, 10, 44)) m = MAT.TUTWALL;  // 목표 선반
  if (rect(x, y, 8, 43, 11, 43)) m = MAT.AIR;      // 선반 → 탈출 통로
  if (rect(x, y, 12, 43, 14, 43)) m = MAT.AIR;
  if (rect(x, y, 13, 44, 14, 56)) m = MAT.AIR;     // 수직 통로

  // −28m 폭탄으로만 뚫리는 벽
  if (rect(x, y, 12, 57, 15, 58)) m = MAT.REINFORCED;

  // −30m 보물상자 방
  if (rect(x, y, 10, 59, 17, 64)) m = MAT.AIR;
  if (rect(x, y, 10, 65, 17, 65)) m = MAT.STONE;

  // −33m 긴 경암 구간 (드릴·레이저가 빠름)
  if (rect(x, y, 12, 66, 15, 76)) m = MAT.HARD;

  // −39m 물웅덩이
  if (rect(x, y, 8, 77, 20, 81)) m = MAT.AIR;
  if (rect(x, y, 8, 82, 20, 82)) m = MAT.STONE;
  if (rect(x, y, 8, 79, 20, 81)) m = MAT.WATER;

  // −42m 모래 붕괴 지점
  if (rect(x, y, 10, 84, 18, 86)) m = MAT.SAND;
  if (rect(x, y, 10, 87, 20, 91)) m = MAT.AIR;

  // −47m 고양이 방 (소나를 여러 번 써야 찾는 거리)
  if (rect(x, y, 33, 91, 40, 95)) m = MAT.AIR;
  if (rect(x, y, 33, 96, 40, 96)) m = MAT.STONE;

  // −50m E1 정거장
  if (rect(x, y, 24, 97, 38, 100)) m = MAT.AIR;
  if (rect(x, y, 24, 101, 38, 101)) m = MAT.STATION;

  return pack(m);
}
