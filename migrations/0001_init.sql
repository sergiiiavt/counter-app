CREATE TABLE IF NOT EXISTS counters (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  aggregation TEXT NOT NULL CHECK (aggregation IN ('sum', 'count', 'latest', 'average')),
  daily_goal REAL,
  presets_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS counter_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  counter_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  occurred_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_counter_entries_daily
  ON counter_entries (user_id, counter_id, local_date, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_counter_entries_user_created
  ON counter_entries (user_id, created_at DESC);
