// GET/POST /api/profile — loadProfile · saveProfile (§6-1)
import { json, tokenOf } from '../_lib/util.js';

const NAME_MAX = 8; // moderateName과 같은 길이 제한 (§6-3)

export async function onRequestGet({ request, env }) {
  const token = tokenOf(request);
  if (!token) return json({ ok: false }, 400);
  const row = await env.DB.prepare('SELECT * FROM profiles WHERE token = ?').bind(token).first();
  if (!row) return json({ ok: true, profile: null });
  return json({
    ok: true,
    profile: {
      name: row.name,
      season: row.season,
      upgrades: JSON.parse(row.upgrades),
      bank: row.bank,
      seasonCats: row.season_cats,
      bestDepth: row.best_depth,
      bestCats: row.best_cats,
      clinicUses: row.clinic_uses,
      tutorialDone: !!row.tutorial_done,
    },
  });
}

export async function onRequestPost({ request, env }) {
  const token = tokenOf(request);
  if (!token) return json({ ok: false }, 400);
  let p;
  try { p = await request.json(); } catch { return json({ ok: false }, 400); }

  await env.DB.prepare(`
    INSERT INTO profiles
      (token, name, season, upgrades, bank, season_cats, best_depth, best_cats, clinic_uses, tutorial_done, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      name = excluded.name, season = excluded.season, upgrades = excluded.upgrades,
      bank = excluded.bank, season_cats = excluded.season_cats, best_depth = excluded.best_depth,
      best_cats = excluded.best_cats, clinic_uses = excluded.clinic_uses,
      tutorial_done = excluded.tutorial_done, updated_at = excluded.updated_at
  `).bind(
    token,
    String(p.name ?? '').slice(0, NAME_MAX),
    String(p.season ?? ''),
    JSON.stringify(p.upgrades ?? {}),
    Math.max(0, p.bank | 0),
    Math.max(0, p.seasonCats | 0),
    Math.max(0, p.bestDepth | 0),
    Math.max(0, p.bestCats | 0),
    Math.max(0, p.clinicUses | 0),
    p.tutorialDone ? 1 : 0,
    Date.now(),
  ).run();

  return json({ ok: true });
}
