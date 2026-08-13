// GET/POST /api/flags — fetchMarkers·postFlag. 메시지는 이미 클라이언트에서
// moderate()를 거쳤다 (§6-3). GET은 최근 200개만 돌려준다 — 지리 박스 질의는
// 없다, 월드가 시즌마다 시드 하나를 공유하는 단일 좌표계라 굳이 안 나눈다.
import { json } from '../_lib/util.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const season = url.searchParams.get('season') || '';
  const { results } = await env.DB.prepare(
    'SELECT id, x, y, msg, level, owner FROM flags WHERE season = ? ORDER BY id DESC LIMIT 200',
  ).bind(season).all();
  return json({ flags: results });
}

export async function onRequestPost({ request, env }) {
  let f;
  try { f = await request.json(); } catch { return json({ ok: false }, 400); }

  await env.DB.prepare(
    'INSERT INTO flags (x, y, msg, level, owner, season, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    Number(f.x) || 0,
    Number(f.y) || 0,
    String(f.msg ?? '').slice(0, 30),
    Math.max(1, f.level | 0),
    String(f.owner ?? '').slice(0, 8),
    String(f.season ?? ''),
    Date.now(),
  ).run();

  return json({ ok: true });
}
