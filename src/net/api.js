// ── 백엔드 경계 ────────────────────────────────────────────────────
// Cloudflare Pages Functions + D1 (functions/api/*, migrations/0001_init.sql).
//
//   loadProfile / saveProfile   → GET/POST /api/profile
//   submitRun / fetchLeaderboard→ POST /api/runs · GET /api/leaderboard
//   postFlag / fetchMarkers     → POST /api/flags · GET /api/flags + /api/corpses
//   postCorpse / lootCorpse     → POST /api/corpses · POST /api/corpses/loot
//   moderate                    → 1~2단계만 클라이언트. 3단계 LLM 판정은 서버 몫으로
//                                  남겨둔 미구현 (별도 바인딩·비용 결정이 필요하다)
//
// 서버 요청은 전부 실패해도 무시한다 — 로컬에 먼저 쓰고 나서 보내므로,
// 채굴·전투·성장은 네트워크 상태와 무관하게 진행된다 (§11-2).

import { FLAG } from '../data/balance.js';

export const BACKEND = { kind: 'cloudflare', online: true, note: 'Cloudflare Pages + D1' };
const API_TIMEOUT = 4000;

/** 실패(네트워크 오류·타임아웃·비-2xx)하면 조용히 null. 호출부가 로컬로 대체한다. */
async function apiFetch(path, opts = {}) {
  try {
    const res = await fetch(path, { ...opts, signal: AbortSignal.timeout(API_TIMEOUT) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 시즌 시드. 서버가 배포되면 서버 값을 쓴다 (§6-1) */
export const SEASON = { id: '2026-S1', seed: 20260811 };

const K = {
  profile: 'cac.profile.v1',
  runs: 'cac.runs.v1',
  token: 'cac.token.v1',
  flags: 'cac.flags.v1',
};

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function anonToken() {
  let t = read(K.token, null);
  if (!t) {
    t = 'a' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    write(K.token, t);
  }
  return t;
}

export function defaultProfile() {
  return {
    name: '',
    token: anonToken(),
    season: SEASON.id,
    upgrades: {
      pickSpeed: 1, pickRange: 1, sonar: 1, grapple: 1,
      bomb: 1, drill: 1, laser: 1, flag: 1, maxHp: 1,
    },
    bank: 0,
    seasonCats: 0,
    bestDepth: 0,
    bestCats: 0,
    clinicUses: 0,
    controlsSeen: false,
  };
}

export async function loadProfile() {
  const token = anonToken();
  const base = defaultProfile();
  const remote = await apiFetch('/api/profile', { headers: { 'x-player-token': token } });

  // 시즌이 바뀌면 업그레이드·예치금만 승계 (§6-5)
  const finish = (p) => {
    const merged = p.season !== SEASON.id
      ? { ...base, upgrades: p.upgrades ?? base.upgrades, bank: p.bank ?? 0, name: p.name ?? '' }
      : { ...base, ...p, upgrades: { ...base.upgrades, ...(p.upgrades || {}) } };
    write(K.profile, merged); // 다음 오프라인 기동을 위한 캐시
    return merged;
  };

  if (remote?.ok && remote.profile) return finish(remote.profile);
  // 서버 불통이거나 서버에 아직 기록이 없다 — 로컬 캐시로 대체
  const local = read(K.profile, null);
  return local ? finish(local) : base;
}

export async function saveProfile(p) {
  write(K.profile, p); // 네트워크를 기다리지 않고 즉시 반영
  apiFetch('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-player-token': p.token || anonToken() },
    body: JSON.stringify(p),
  }); // 실패해도 무시 — 다음 저장 때 다시 보내진다 (§11-2)
  return true;
}

export async function submitRun(run) {
  const token = anonToken();
  const runs = read(K.runs, []);
  runs.push({ name: run.name, token, season: SEASON.id, depth: Math.round(run.depth), cats: run.cats, at: Date.now() });
  // 오프라인 폴백용 — 서버가 살아 있으면 리더보드는 서버 값을 쓰므로 최근 500건만 유지
  write(K.runs, runs.slice(-500));
  apiFetch('/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-player-token': token },
    body: JSON.stringify({ name: run.name, season: SEASON.id, depth: run.depth, cats: run.cats }),
  });
  return true;
}

function localLeaderboard(kind) {
  const runs = read(K.runs, []).filter((r) => r.season === SEASON.id);
  const token = anonToken();
  let rows;
  if (kind === 'seasonCats') {
    const byToken = new Map();
    for (const r of runs) {
      const cur = byToken.get(r.token) || { name: r.name, token: r.token, value: 0 };
      cur.value += r.cats;
      cur.name = r.name;
      byToken.set(r.token, cur);
    }
    rows = [...byToken.values()];
  } else {
    const key = kind === 'cats' ? 'cats' : 'depth';
    const best = new Map();
    for (const r of runs) {
      const cur = best.get(r.token);
      if (!cur || r[key] > cur.value) best.set(r.token, { name: r.name, token: r.token, value: r[key] });
    }
    rows = [...best.values()];
  }
  rows.sort((a, b) => b.value - a.value);
  rows.forEach((r, i) => { r.rank = i + 1; });
  const me = rows.find((r) => r.token === token) || null;
  return { top: rows.slice(0, 10), me, myRank: me ? me.rank : 0 };
}

/**
 * @param {'depth'|'cats'|'seasonCats'} kind
 * @returns {Promise<{top: Array, me: object|null, myRank: number}>}
 */
export async function fetchLeaderboard(kind = 'depth') {
  const token = anonToken();
  const remote = await apiFetch(
    `/api/leaderboard?kind=${encodeURIComponent(kind)}&season=${encodeURIComponent(SEASON.id)}`,
    { headers: { 'x-player-token': token } },
  );
  // 서버 값은 전체 플레이어 집계라 로컬(내 기록만)보다 항상 우선한다
  return remote ?? localLeaderboard(kind);
}

// ── 비동기 멀티 (§9) — 남의 플래그·시체를 받아와 화면에 얹는다 ─────
const K_CORPSE_SEEN = 'cac.corpseSeen.v1';

export async function fetchMarkers() {
  const [flagsRes, corpsesRes] = await Promise.all([
    apiFetch(`/api/flags?season=${encodeURIComponent(SEASON.id)}`),
    apiFetch(`/api/corpses?season=${encodeURIComponent(SEASON.id)}`),
  ]);
  return {
    flags: (flagsRes && flagsRes.flags) || [],
    corpses: (corpsesRes && corpsesRes.corpses) || [],
  };
}

export async function postFlag(flag) {
  const flags = read(K.flags, []);
  flags.push({ ...flag, at: Date.now() });
  write(K.flags, flags.slice(-200));
  apiFetch('/api/flags', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(flag),
  });
  return true;
}

export async function postCorpse(corpse) {
  const res = await apiFetch('/api/corpses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpse),
  });
  return !!(res && res.ok);
}

export async function lootCorpse(id) {
  const seen = read(K_CORPSE_SEEN, []);
  if (seen.includes(id)) return { ok: false, reason: 'already-looted' };
  const res = await apiFetch('/api/corpses/loot', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-player-token': anonToken() },
    body: JSON.stringify({ id }),
  });
  if (!res) return { ok: false, reason: 'offline' };
  if (res.ok) write(K_CORPSE_SEEN, [...seen, id].slice(-500));
  return res;
}

// ── 모더레이션 1~2단계 (§6-3). 3단계 LLM 판정은 서버 몫 ───────────
const BANNED = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '좆', 'fuck', 'shit', 'bitch', 'asshole', '니애미', '느금'];

// 자소 분리 복원 — 「ㅅㅣ발」처럼 낱자로 흩어 쓴 우회를 되돌린다 (§6-3 2단계)
const JAMO_L = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JAMO_V = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JAMO_T = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ',
  'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export function composeJamo(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const li = JAMO_L.indexOf(s[i]);
    const vi = li >= 0 ? JAMO_V.indexOf(s[i + 1] ?? '') : -1;
    if (vi >= 0) {
      let ti = 0, len = 2;
      const t = JAMO_T.indexOf(s[i + 2] ?? '');
      // 다음이 또 초성+중성이면 그 자음은 종성이 아니라 다음 글자의 초성이다
      const nextIsSyllable = JAMO_V.indexOf(s[i + 3] ?? '') >= 0;
      if (t > 0 && !nextIsSyllable) { ti = t; len = 3; }
      out.push(String.fromCharCode(0xac00 + (li * 21 + vi) * 28 + ti));
      i += len;
      continue;
    }
    out.push(s[i]);
    i++;
  }
  return out.join('');
}

export function normalize(text) {
  return composeJamo(
    String(text)
      .replace(/\s+/g, '')
      .replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '')
      .toLowerCase()
      .replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
  );
}

/** 한글 사이에 숫자·라틴 문자를 끼워 넣는 우회를 잡는 변형 */
function hangulOnly(text) {
  return composeJamo(String(text).replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, ''));
}

// 로마자 음절 치환 — 「병shin」처럼 한글과 라틴을 섞는 우회를 일부 잡는다.
// 맥락형 비방까지 걸러내는 것은 3단계(LLM 판정) 몫이다.
const ROMAN_SYL = [
  ['shin', '신'], ['sin', '신'], ['byeong', '병'], ['byung', '병'], ['byong', '병'],
  ['ssi', '씨'], ['shi', '시'], ['bal', '발'], ['gae', '개'], ['saekki', '새끼'], ['seki', '새끼'],
];
function romanized(normalized) {
  let s = normalized;
  for (const [r, h] of ROMAN_SYL) s = s.split(r).join(h);
  return s;
}

/** 1단계 입력 제한 + 2단계 사전 매칭 */
export function moderate(raw, maxLen = FLAG.msgLen) {
  let t = String(raw ?? '').replace(/[\r\n]+/g, ' ').trim();
  // 허용 문자만
  t = t.replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ .,!?~()\-'"]/g, '');
  // 동일 문자 3회 초과 압축
  t = t.replace(/(.)\1{2,}/g, '$1$1$1');
  if (t.length > maxLen) t = t.slice(0, maxLen);
  if (!t) return { ok: false, reason: '내용이 비어 있다', text: '' };
  const n = normalize(t);
  const variants = [n, hangulOnly(t), romanized(n)];
  for (const w of BANNED) {
    const nw = normalize(w);
    if (variants.some((v) => v.includes(nw))) return { ok: false, reason: '부적절한 표현이 포함됐다', text: t };
  }
  return { ok: true, text: t };
}

export function moderateName(raw) {
  return moderate(raw, 8);
}
