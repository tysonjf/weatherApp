"""SQLite storage shared by the BLE logger (writer) and MCP server (reader).

The database file is the interface between the two processes; SQLite's WAL
mode makes concurrent single-writer/many-reader access safe. Default location
is ``~/.inkbird-bbq/inkbird.db`` (override with the ``INKBIRD_DB`` env var).
"""

from __future__ import annotations

import os
import sqlite3
import time
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY,
    ts REAL NOT NULL,                -- unix epoch seconds
    probe1_internal REAL,            -- all temps in °C, NULL = absent/error
    probe1_ambient REAL,
    probe2_internal REAL,
    probe2_ambient REAL,
    base_ambient REAL,
    batt_base INTEGER,
    batt_probe1 INTEGER,
    batt_probe2 INTEGER
);
CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings (ts);

CREATE TABLE IF NOT EXISTS cooks (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    meat_type TEXT,
    target_internal_c REAL,
    probe INTEGER NOT NULL DEFAULT 1,
    started_at REAL NOT NULL,
    ended_at REAL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    cook_id INTEGER REFERENCES cooks(id),
    ts REAL NOT NULL,
    text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logger_status (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


def db_path() -> Path:
    env = os.environ.get("INKBIRD_DB")
    if env:
        return Path(env).expanduser()
    return Path.home() / ".inkbird-bbq" / "inkbird.db"


def connect(path: Path | None = None) -> sqlite3.Connection:
    p = path or db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(p, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn


# ---------------------------------------------------------------- writer side


def insert_reading(
    conn: sqlite3.Connection,
    ts: float,
    temps: dict[str, float | None],
    batts: dict[str, int | None],
) -> None:
    conn.execute(
        """INSERT INTO readings (ts, probe1_internal, probe1_ambient,
               probe2_internal, probe2_ambient, base_ambient,
               batt_base, batt_probe1, batt_probe2)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            ts,
            temps.get("probe1_internal"),
            temps.get("probe1_ambient"),
            temps.get("probe2_internal"),
            temps.get("probe2_ambient"),
            temps.get("base_ambient"),
            batts.get("base"),
            batts.get("probe1"),
            batts.get("probe2"),
        ),
    )
    conn.commit()


def set_status(conn: sqlite3.Connection, **kv: str | int | float | None) -> None:
    for k, v in kv.items():
        conn.execute(
            "INSERT INTO logger_status (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (k, None if v is None else str(v)),
        )
    conn.commit()


# ---------------------------------------------------------------- reader side


def get_status(conn: sqlite3.Connection) -> dict[str, str]:
    return {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM logger_status")}


def latest_reading(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM readings ORDER BY ts DESC LIMIT 1").fetchone()


def readings_between(
    conn: sqlite3.Connection, start: float, end: float | None = None
) -> list[sqlite3.Row]:
    end = end if end is not None else time.time()
    return conn.execute(
        "SELECT * FROM readings WHERE ts >= ? AND ts <= ? ORDER BY ts", (start, end)
    ).fetchall()


def active_cook(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM cooks WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
    ).fetchone()


def get_cook(conn: sqlite3.Connection, cook_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM cooks WHERE id = ?", (cook_id,)).fetchone()


def cook_events(conn: sqlite3.Connection, cook_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM events WHERE cook_id = ? ORDER BY ts", (cook_id,)
    ).fetchall()
