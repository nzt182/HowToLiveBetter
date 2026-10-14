CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  visited_at TEXT NOT NULL,
  page TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS visits_visited_at_idx ON visits (visited_at);
