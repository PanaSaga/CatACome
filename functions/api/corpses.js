// GET/POST /api/corpses — fetchMarkers·postCorpse (§9)
// looted_by가 채워진 시체는 목록에서 뺀다 — 이미 누가 가져간 자리다.
import { json } from '../_lib/util.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const season = url.searchParams.get('season') || '';
  const { results } = await env.DB.prepare(
    'SELECT id, x, y, owner, copper, cause FROM corpses WHERE season = ? AND looted_by IS NULL ORDER BY id DESC LIMIT 200',
  ).bind(season).all();
  return json({ corpses: results });
}

export async function onRequestPost({ request, env }) {
  let c;
  try { c = await request.json(); } catch { return json({ ok: false }, 400); }

  await env.DB.prepare(
    'INSERT INTO corpses (x, y, owner, copper, cause, season, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    Number(c.x) || 0,
    Number(c.y) || 0,
    String(c.owner ?? '').slice(0, 8),
    Math.max(0, c.copper | 0),
    String(c.cause ?? '').slice(0, 20),
    String(c.season ?? ''),
    Date.now(),
  ).run();

  return json({ ok: true });
}
