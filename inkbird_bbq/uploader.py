"""Forward recorded readings to your own HTTPS endpoint.

The INT-12-BW base station's firmware can't be repointed at a custom server —
its Wi-Fi mode only talks to Inkbird's private cloud. Instead, this uploader
runs inside ``inkbird-logger`` and ships each reading to any URL you control
(e.g. a Next.js API route; see ``examples/nextjs/``):

    inkbird-logger --upload-url https://example.com/api/inkbird/readings \\
                   --upload-token <shared-secret>

Readings are drained from the same SQLite database the logger writes, with the
upload cursor persisted in ``logger_status``. That makes uploads loss-free
across Wi-Fi drops, endpoint downtime, and logger restarts: rows simply queue
locally and are backfilled in order once the endpoint is reachable again.

Requests are plain JSON POSTs authenticated with a bearer token:

    POST <url>
    Authorization: Bearer <token>
    {"source": "inkbird-logger", "readings": [{"ts": ..., "probe1_internal": ...}, ...]}

Only the standard library is used (urllib), so this runs anywhere the logger
does — including a Raspberry Pi.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sqlite3
import urllib.error
import urllib.request
from collections.abc import Callable

from . import db

log = logging.getLogger("inkbird.uploader")

BATCH_LIMIT = 500  # readings per POST; multiple batches drain per cycle
CURSOR_KEY = "upload_last_id"
MAX_BACKOFF = 300.0

READING_FIELDS = (
    "ts",
    "probe1_internal",
    "probe1_ambient",
    "probe2_internal",
    "probe2_ambient",
    "base_ambient",
    "batt_base",
    "batt_probe1",
    "batt_probe2",
)


def post_json(url: str, token: str | None, payload: dict, timeout: float = 15.0) -> None:
    """POST *payload* as JSON; raises on any non-2xx response or network error."""
    headers = {"Content-Type": "application/json", "User-Agent": "inkbird-logger"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # raises HTTPError on 4xx/5xx
        if not 200 <= resp.status < 300:
            raise urllib.error.HTTPError(url, resp.status, resp.reason, resp.headers, None)


class Uploader:
    """Drains new ``readings`` rows to an HTTPS endpoint, tracking a cursor.

    The cursor only advances after a successful POST, so a failed or
    interrupted upload is retried with the same rows (make the endpoint
    idempotent — the example route dedupes on ``ts``).
    """

    def __init__(
        self,
        conn: sqlite3.Connection,
        url: str,
        token: str | None,
        interval: float = 30.0,
        post: Callable[[str, str | None, dict], None] = post_json,
    ):
        self.conn = conn
        self.url = url
        self.token = token
        self.interval = interval
        self._post = post

    # ------------------------------------------------------------- plumbing

    def _cursor(self) -> int:
        raw = db.get_status(self.conn).get(CURSOR_KEY)
        return int(raw) if raw else 0

    def _pending(self, after_id: int) -> list[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM readings WHERE id > ? ORDER BY id LIMIT ?",
            (after_id, BATCH_LIMIT),
        ).fetchall()

    @staticmethod
    def _to_json(row: sqlite3.Row) -> dict:
        return {f: row[f] for f in READING_FIELDS}

    # ------------------------------------------------------------- uploading

    async def upload_once(self) -> int:
        """Upload every pending reading (in batches); returns rows shipped."""
        total = 0
        while True:
            cursor = self._cursor()
            rows = self._pending(cursor)
            if not rows:
                return total
            payload = {
                "source": "inkbird-logger",
                "readings": [self._to_json(r) for r in rows],
            }
            await asyncio.to_thread(self._post, self.url, self.token, payload)
            db.set_status(self.conn, **{CURSOR_KEY: rows[-1]["id"]})
            total += len(rows)
            if len(rows) < BATCH_LIMIT:
                return total

    async def run(self, stop: asyncio.Event) -> None:
        """Upload loop with backoff; runs until *stop* is set, then flushes."""
        log.info("uploading readings to %s every %.0fs", self.url, self.interval)
        backoff = self.interval
        while not stop.is_set():
            try:
                n = await self.upload_once()
                if n:
                    log.debug("uploaded %d reading(s)", n)
                delay = backoff = self.interval
            except Exception as e:
                delay = backoff
                backoff = min(backoff * 2, MAX_BACKOFF)
                log.warning("upload failed: %s — readings stay queued locally, "
                            "retrying in %.0fs", e, delay)
            try:
                await asyncio.wait_for(stop.wait(), timeout=delay)
            except asyncio.TimeoutError:
                pass
        # final flush so a clean shutdown doesn't strand the last few readings
        try:
            await self.upload_once()
        except Exception as e:
            log.warning("final flush failed: %s (rows remain queued for next run)", e)
