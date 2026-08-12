-- 프로필 · 리더보드 · 플래그. net/api.js가 실제로 부르는 것만 만든다
-- (fetchMarkers·postCorpse·lootCorpse는 게임 코드에서 호출되지 않아 테이블도 없다).

CREATE TABLE IF NOT EXISTS profiles (
  token TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  season TEXT NOT NULL DEFAULT '',
  upgrades TEXT NOT NULL DEFAULT '{}',
  bank INTEGER NOT NULL DEFAULT 0,
  season_cats INTEGER NOT NULL DEFAULT 0,
  best_depth INTEGER NOT NULL DEFAULT 0,
  best_cats INTEGER NOT NULL DEFAULT 0,
  clinic_uses INTEGER NOT NULL DEFAULT 0,
  tutorial_done INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  depth REAL NOT NULL,
  cats INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_season ON runs(season);
CREATE INDEX IF NOT EXISTS idx_runs_token ON runs(token);

CREATE TABLE IF NOT EXISTS flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  msg TEXT NOT NULL,
  level INTEGER NOT NULL,
  owner TEXT NOT NULL,
  season TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flags_season ON flags(season);
