-- 타인 시체(§9) — 사망 지점에 남는 재화를 다른 플레이어가 뒤져 가져갈 수 있다.
-- looted_by가 채워지면(NULL이 아니면) 이미 누군가 가져간 자리다.

CREATE TABLE IF NOT EXISTS corpses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  owner TEXT NOT NULL,
  copper INTEGER NOT NULL DEFAULT 0,
  cause TEXT NOT NULL DEFAULT '',
  season TEXT NOT NULL DEFAULT '',
  looted_by TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corpses_season ON corpses(season);
