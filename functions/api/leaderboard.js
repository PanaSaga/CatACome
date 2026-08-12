// GET /api/leaderboard?kind=depth|cats|seasonCats&season=... — fetchLeaderboard (§6)
import { json } from '../_lib/util.js';

/**
 * kind별 순위(RANK)까지 매긴 (token, name, value, rnk) 완성 SQL 하나를 돌려준다.
 * depth·cats는 "그 값을 낸 판의 이름"을 붙여야 하므로 SQLite의 bare-column 규칙
 * (집계가 MAX/MIN 하나뿐이면 나머지 컬럼은 그 최댓값을 낸 행에서 온다)을 그대로
 * 쓴다 — 로컬 스텁이 하던 "r[key] > cur.value일 때만 이름 교체"와 정확히 같다.
 * seasonCats는 SUM이라 그 규칙이 안 통해서, 가장 최근 판(id 최대)의 이름을 따로
 * 조인한다 — 로컬 스텁의 "마지막에 덮어쓴 이름이 남는다"와 같다.
 */
function rankedSql(kind) {
  if (kind === 'seasonCats') {
    return `
      WITH totals AS (
        SELECT token, SUM(cats) AS value, MAX(id) AS last_id FROM runs WHERE season = ? GROUP BY token
      ), agg AS (
        SELECT totals.token AS token, r.name AS name, totals.value AS value
        FROM totals JOIN runs r ON r.id = totals.last_id
      )
      SELECT token, name, value, RANK() OVER (ORDER BY value DESC) AS rnk FROM agg
    `;
  }
  const col = kind === 'cats' ? 'cats' : 'depth';
  return `
    WITH agg AS (
      SELECT token, name, MAX(${col}) AS value FROM runs WHERE season = ? GROUP BY token
    )
    SELECT token, name, value, RANK() OVER (ORDER BY value DESC) AS rnk FROM agg
  `;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') || 'depth';
  const season = url.searchParams.get('season') || '';
  const token = request.headers.get('x-player-token') || '';

  const { results } = await env.DB.prepare(rankedSql(kind)).bind(season).all();
  const rows = results.map((r) => ({ name: r.name, token: r.token, value: r.value, rank: r.rnk }));

  const top = rows.slice(0, 10);
  const me = token ? rows.find((r) => r.token === token) || null : null;
  return json({ top, me, myRank: me ? me.rank : 0 });
}
