// POST /api/runs — submitRun. 죽었을 때 한 번 기록되고, 실패해도 게임은 계속된다 (§11-2)
import { json, tokenOf } from '../_lib/util.js';

export async function onRequestPost({ request, env }) {
  const token = tokenOf(request);
  if (!token) return json({ ok: false }, 400);
  let r;
  try { r = await request.json(); } catch { return json({ ok: false }, 400); }

  await env.DB.prepare(
    'INSERT INTO runs (token, name, season, depth, cats, at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(
    token,
    String(r.name ?? '무명').slice(0, 8),
    String(r.season ?? ''),
    Math.max(0, Number(r.depth) || 0),
    Math.max(0, r.cats | 0),
    Date.now(),
  ).run();

  return json({ ok: true });
}
