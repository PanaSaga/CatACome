// POST /api/flags — postFlag. 메시지는 이미 클라이언트에서 moderate()를 거쳤다 (§6-3)
import { json } from '../_lib/util.js';

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
