// POST /api/corpses/loot — lootCorpse. 원자적 선점: looted_by가 비어 있을 때만
// 갱신되므로, 동시에 두 명이 눌러도 재화는 한 명에게만 나간다.
import { json, tokenOf } from '../../_lib/util.js';

export async function onRequestPost({ request, env }) {
  const token = tokenOf(request);
  if (!token) return json({ ok: false, reason: 'bad-token' }, 400);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false }, 400); }
  const id = b.id | 0;
  if (!id) return json({ ok: false, reason: 'bad-id' }, 400);

  const row = await env.DB.prepare(
    'UPDATE corpses SET looted_by = ? WHERE id = ? AND looted_by IS NULL RETURNING copper',
  ).bind(token, id).first();

  if (!row) return json({ ok: false, reason: 'already-looted' });
  return json({ ok: true, copper: row.copper });
}
