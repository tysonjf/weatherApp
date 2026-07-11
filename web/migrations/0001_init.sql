-- Applied with: wrangler d1 migrations apply inkbird-db --remote (or --local)
CREATE TABLE readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    probe1_internal REAL,
    probe1_ambient REAL,
    probe2_internal REAL,
    probe2_ambient REAL,
    base_ambient REAL,
    batt_base INTEGER,
    batt_probe1 INTEGER,
    batt_probe2 INTEGER
);
CREATE UNIQUE INDEX idx_readings_ts ON readings (ts);

CREATE TABLE cooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    meat_type TEXT,
    target_internal_c REAL,
    probe INTEGER NOT NULL DEFAULT 1,
    started_at REAL NOT NULL,
    ended_at REAL
);

CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cook_id INTEGER NOT NULL REFERENCES cooks(id) ON DELETE CASCADE,
    ts REAL NOT NULL,
    text TEXT NOT NULL
);
CREATE INDEX idx_notes_cook ON notes (cook_id);
