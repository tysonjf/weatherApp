"""MCP stdio server exposing the Inkbird BBQ data to Claude.

Register with Claude Code:

    claude mcp add inkbird-bbq -- uv run --project /path/to/repo inkbird-mcp

Tools operate on the SQLite database written by ``inkbird-logger``; the
``start_logger`` tool can spawn the logger itself so a whole cook can be
managed from a Claude conversation.
"""

from __future__ import annotations

import os
import signal
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone

from mcp.server.fastmcp import FastMCP

from . import analysis, db

mcp = FastMCP(
    "inkbird-bbq",
    instructions=(
        "Tools for a live Inkbird INT-12-BW BBQ thermometer. Temperatures are "
        "recorded by a companion logger process. Typical flow: check "
        "get_live_status, start_cook when food goes on, then use analyze_cook "
        "for trends/ETA/stall detection to advise the user on their BBQ. "
        "'internal' = food/meat temperature from the probe tip; 'ambient' = "
        "pit/grill temperature from the probe's base sensor."
    ),
)

STALE_AFTER_S = 30.0


def _now_iso(ts: float | None = None) -> str:
    return datetime.fromtimestamp(ts or time.time(), tz=timezone.utc).astimezone().isoformat(
        timespec="seconds"
    )


def _reading_dict(row) -> dict:
    return {
        "time": _now_iso(row["ts"]),
        "age_seconds": round(time.time() - row["ts"], 1),
        "probe1": {
            "internal_c": row["probe1_internal"],
            "internal_f": analysis.c_to_f(row["probe1_internal"]),
            "pit_ambient_c": row["probe1_ambient"],
            "pit_ambient_f": analysis.c_to_f(row["probe1_ambient"]),
        },
        "probe2": {
            "internal_c": row["probe2_internal"],
            "internal_f": analysis.c_to_f(row["probe2_internal"]),
            "pit_ambient_c": row["probe2_ambient"],
            "pit_ambient_f": analysis.c_to_f(row["probe2_ambient"]),
        },
        "base_ambient_c": row["base_ambient"],
        "battery_percent": {
            "base": row["batt_base"],
            "probe1": row["batt_probe1"],
            "probe2": row["batt_probe2"],
        },
    }


def _cook_dict(conn, cook) -> dict:
    return {
        "id": cook["id"],
        "name": cook["name"],
        "meat_type": cook["meat_type"],
        "probe": cook["probe"],
        "target_internal_c": cook["target_internal_c"],
        "target_internal_f": analysis.c_to_f(cook["target_internal_c"]),
        "started_at": _now_iso(cook["started_at"]),
        "ended_at": _now_iso(cook["ended_at"]) if cook["ended_at"] else None,
        "elapsed_minutes": round(((cook["ended_at"] or time.time()) - cook["started_at"]) / 60, 1),
        "notes": cook["notes"],
        "events": [
            {"time": _now_iso(e["ts"]), "text": e["text"]} for e in db.cook_events(conn, cook["id"])
        ],
    }


def _series(conn, cook, column: str, start: float, end: float | None) -> list[analysis.Point]:
    rows = db.readings_between(conn, start, end)
    return [(r["ts"], r[column]) for r in rows if r[column] is not None]


def _resolve_cook(conn, cook_id: int | None):
    if cook_id is not None:
        cook = db.get_cook(conn, cook_id)
        if not cook:
            raise ValueError(f"no cook with id {cook_id}")
        return cook
    return db.active_cook(conn)


@mcp.tool()
def get_live_status() -> dict:
    """Current thermometer state: logger health, latest temperatures for both
    probes (food internal + pit ambient), battery levels, and the active cook
    session if one is running."""
    conn = db.connect()
    try:
        status = db.get_status(conn)
        latest = db.latest_reading(conn)
        last_seen = float(status.get("last_seen", 0) or 0)
        logger_alive = (time.time() - last_seen) < STALE_AFTER_S if last_seen else False
        out: dict = {
            "logger": {
                "running": logger_alive,
                "state": status.get("state", "never started"),
                "mode": status.get("mode"),
                "device": status.get("device") or None,
                "hint": None
                if logger_alive
                else "Logger is not running. Use the start_logger tool or run "
                "`inkbird-logger` on the machine near the thermometer.",
            },
            "latest_reading": None,
            "reading_is_stale": None,
            "active_cook": None,
        }
        if latest:
            out["latest_reading"] = _reading_dict(latest)
            out["reading_is_stale"] = (time.time() - latest["ts"]) > STALE_AFTER_S
        cook = db.active_cook(conn)
        if cook:
            out["active_cook"] = _cook_dict(conn, cook)
        return out
    finally:
        conn.close()


@mcp.tool()
def start_cook(
    name: str,
    meat_type: str | None = None,
    target_internal_c: float | None = None,
    target_internal_f: float | None = None,
    probe: int = 1,
    notes: str | None = None,
) -> dict:
    """Start tracking a cook session (e.g. when the brisket goes on the
    smoker). Give the target doneness temperature in either °C or °F; `probe`
    is which probe (1 or 2) is in the food. Only one cook can be active at a
    time."""
    if probe not in (1, 2):
        raise ValueError("probe must be 1 or 2")
    target_c = target_internal_c
    if target_c is None and target_internal_f is not None:
        target_c = round((target_internal_f - 32) * 5 / 9, 1)
    conn = db.connect()
    try:
        existing = db.active_cook(conn)
        if existing:
            raise ValueError(
                f"cook '{existing['name']}' (id {existing['id']}) is already active; "
                "end it first with end_cook"
            )
        cur = conn.execute(
            "INSERT INTO cooks (name, meat_type, target_internal_c, probe, started_at, notes) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (name, meat_type, target_c, probe, time.time(), notes),
        )
        conn.commit()
        return _cook_dict(conn, db.get_cook(conn, cur.lastrowid))
    finally:
        conn.close()


@mcp.tool()
def end_cook(cook_id: int | None = None) -> dict:
    """End the active cook session (or a specific one by id) — food is off the
    grill/smoker."""
    conn = db.connect()
    try:
        cook = _resolve_cook(conn, cook_id)
        if not cook:
            raise ValueError("no active cook to end")
        conn.execute("UPDATE cooks SET ended_at = ? WHERE id = ?", (time.time(), cook["id"]))
        conn.commit()
        return _cook_dict(conn, db.get_cook(conn, cook["id"]))
    finally:
        conn.close()


@mcp.tool()
def add_cook_note(text: str, cook_id: int | None = None) -> dict:
    """Log a timestamped event on the active cook — e.g. 'wrapped in butcher
    paper', 'added charcoal', 'spritzed'. These show up in analyze_cook so
    trend changes can be explained."""
    conn = db.connect()
    try:
        cook = _resolve_cook(conn, cook_id)
        if not cook:
            raise ValueError("no active cook; start one with start_cook first")
        conn.execute(
            "INSERT INTO events (cook_id, ts, text) VALUES (?, ?, ?)",
            (cook["id"], time.time(), text),
        )
        conn.commit()
        return {"logged": text, "cook_id": cook["id"], "time": _now_iso()}
    finally:
        conn.close()


@mcp.tool()
def list_cooks(limit: int = 10) -> list[dict]:
    """List recent cook sessions, newest first."""
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT * FROM cooks ORDER BY started_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [_cook_dict(conn, r) for r in rows]
    finally:
        conn.close()


@mcp.tool()
def analyze_cook(cook_id: int | None = None, window_minutes: int | None = None) -> dict:
    """Full analysis of the active cook (or a past one by id): current temps,
    heating rate over 10/30-minute windows, stall detection, ETA to the target
    temperature, and pit-temperature stability. This is the main tool for
    advising the user on how their BBQ is going."""
    conn = db.connect()
    try:
        cook = _resolve_cook(conn, cook_id)
        if not cook:
            raise ValueError("no active cook; use start_cook, or pass a cook_id from list_cooks")
        start = cook["started_at"]
        end = cook["ended_at"]
        if window_minutes:
            start = max(start, ((end or time.time()) - window_minutes * 60))
        p = cook["probe"]
        food = _series(conn, cook, f"probe{p}_internal", start, end)
        pit = _series(conn, cook, f"probe{p}_ambient", start, end)

        now = end or time.time()
        food_a = analysis.analyze_probe(food, target_c=cook["target_internal_c"], now=now)
        pit_a = analysis.analyze_probe(pit, now=now)
        pit_recent = [y for _, y in analysis.window(pit, 30, now)]

        result = {
            "cook": _cook_dict(conn, cook),
            "food": food_a.to_dict(),
            "pit": {
                **pit_a.to_dict(),
                "stability_30min_stddev_c": (
                    round(statistics.pstdev(pit_recent), 2) if len(pit_recent) >= 3 else None
                ),
            },
            "samples": {"food": len(food), "pit": len(pit)},
        }
        if food_a.eta_minutes is not None and food_a.eta_minutes > 0:
            result["food"]["estimated_done_at"] = _now_iso(now + food_a.eta_minutes * 60)
        if not food:
            result["warning"] = (
                "No probe readings recorded for this cook yet — check that the "
                "logger is running and the probe is connected."
            )
        return result
    finally:
        conn.close()


@mcp.tool()
def get_cook_history(
    cook_id: int | None = None, minutes: int | None = None, max_points: int = 120
) -> dict:
    """Time series of food and pit temperature for the active cook (or a past
    one by id), downsampled to at most max_points points — use this to
    describe or chart the cook curve."""
    conn = db.connect()
    try:
        cook = _resolve_cook(conn, cook_id)
        if not cook:
            raise ValueError("no active cook; pass a cook_id from list_cooks")
        start = cook["started_at"]
        end = cook["ended_at"]
        if minutes:
            start = max(start, (end or time.time()) - minutes * 60)
        p = cook["probe"]
        food = analysis.downsample(_series(conn, cook, f"probe{p}_internal", start, end), max_points)
        pit = analysis.downsample(_series(conn, cook, f"probe{p}_ambient", start, end), max_points)
        return {
            "cook_id": cook["id"],
            "probe": p,
            "food_internal_c": [[_now_iso(t), v] for t, v in food],
            "pit_ambient_c": [[_now_iso(t), v] for t, v in pit],
        }
    finally:
        conn.close()


@mcp.tool()
def start_logger(simulate: bool = False, address: str | None = None) -> dict:
    """Start the background data logger on this machine (it connects to the
    thermometer over Bluetooth and records readings). Set simulate=true to
    generate fake cook data for testing without hardware."""
    conn = db.connect()
    try:
        status = db.get_status(conn)
        last_seen = float(status.get("last_seen", 0) or 0)
        if last_seen and (time.time() - last_seen) < STALE_AFTER_S:
            return {"started": False, "reason": "logger already running", "status": status}
    finally:
        conn.close()

    cmd = [sys.executable, "-m", "inkbird_bbq.logger"]
    if simulate:
        cmd.append("--simulate")
    if address:
        cmd += ["--address", address]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
    )
    return {
        "started": True,
        "pid": proc.pid,
        "mode": "simulate" if simulate else "ble",
        "note": "Give it ~20s to scan and connect, then check get_live_status.",
    }


@mcp.tool()
def stop_logger() -> dict:
    """Stop the background data logger process."""
    conn = db.connect()
    try:
        status = db.get_status(conn)
        pid = int(status.get("pid", 0) or 0)
        if not pid:
            return {"stopped": False, "reason": "no logger pid recorded"}
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            return {"stopped": False, "reason": f"process {pid} not running"}
        db.set_status(conn, state="stopping")
        return {"stopped": True, "pid": pid}
    finally:
        conn.close()


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
