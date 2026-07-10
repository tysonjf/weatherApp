"""Data logger daemon: BLE -> SQLite.

Run this on a computer with Bluetooth within range of the base station for
the duration of a cook:

    inkbird-logger                     # scan, connect, record every 5 s
    inkbird-logger --address AA:BB:..  # skip scanning
    inkbird-logger --simulate          # no hardware: generate a fake cook

The MCP server (``inkbird-mcp``) reads the same SQLite database, so Claude
sees live data while this process runs. A heartbeat row in ``logger_status``
lets the server report whether the logger is alive and connected.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import math
import os
import random
import signal
import time

from . import db

log = logging.getLogger("inkbird.logger")

MIN_WRITE_INTERVAL = 2.0  # don't spam the DB if notifications are rapid


class Recorder:
    def __init__(self, conn):
        self.conn = conn
        self._last_write = 0.0

    def on_reading(self, temps: dict, batts: dict) -> None:
        now = time.time()
        if now - self._last_write < MIN_WRITE_INTERVAL:
            return
        self._last_write = now
        db.insert_reading(self.conn, now, temps, batts)


async def run_ble(args) -> None:
    from .ble import InkbirdBLEClient  # deferred: bleak needs a BT stack

    conn = db.connect()
    rec = Recorder(conn)
    client = InkbirdBLEClient(rec.on_reading, address=args.address, poll_interval=args.interval)
    stop = asyncio.Event()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # Windows
            pass

    db.set_status(conn, pid=os.getpid(), mode="ble", started_at=time.time(), state="starting")

    async def heartbeat():
        while not stop.is_set():
            db.set_status(
                conn,
                last_seen=time.time(),
                state="connected" if client.connected else "disconnected",
                device=client.device_name or args.address or "",
            )
            await asyncio.sleep(5)

    hb = asyncio.create_task(heartbeat())
    try:
        await client.run_forever(stop, on_state=lambda s: db.set_status(conn, state=s))
    finally:
        stop.set()
        hb.cancel()
        db.set_status(conn, state="stopped", last_seen=time.time())


# ----------------------------------------------------------------- simulator


class CookSimulator:
    """Generates a plausible low-and-slow cook curve for testing without
    hardware: pit ramps to ~120 °C and oscillates; meat follows a Newtonian
    rise with a stall around 70 °C.
    """

    def __init__(self, start: float, time_scale: float = 1.0):
        self.start = start
        self.time_scale = time_scale  # >1 = accelerated cook

    def sample(self, now: float) -> dict:
        t = (now - self.start) * self.time_scale / 60.0  # minutes of "cook time"
        pit = 20 + 100 * (1 - math.exp(-t / 15)) + 3 * math.sin(t / 7) + random.uniform(-1.5, 1.5)
        # Meat: rises toward pit, with an evaporative-cooling stall near 70°C.
        meat = 8 + (pit - 8) * (1 - math.exp(-t / 180))
        if 65 <= meat <= 76:
            meat = 65 + (meat - 65) * 0.25  # flatten the curve through the stall
        meat += random.uniform(-0.2, 0.2)
        return {
            "probe1_internal": round(meat, 1),
            "probe1_ambient": round(pit, 1),
            "probe2_internal": None,
            "probe2_ambient": None,
            "base_ambient": round(22 + random.uniform(-0.5, 0.5), 1),
        }


async def run_simulator(args) -> None:
    conn = db.connect()
    sim = CookSimulator(start=time.time(), time_scale=args.time_scale)
    stop = asyncio.Event()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass

    db.set_status(
        conn, pid=os.getpid(), mode="simulate", started_at=time.time(),
        state="connected", device="SIMULATOR",
    )
    log.info("simulator running (time_scale=%sx, interval=%ss)", args.time_scale, args.interval)
    batts = {"base": 100, "probe1": 97, "probe2": None}
    try:
        while not stop.is_set():
            db.insert_reading(conn, time.time(), sim.sample(time.time()), batts)
            db.set_status(conn, last_seen=time.time())
            try:
                await asyncio.wait_for(stop.wait(), timeout=args.interval)
            except asyncio.TimeoutError:
                pass
    finally:
        db.set_status(conn, state="stopped", last_seen=time.time())


def main() -> None:
    p = argparse.ArgumentParser(description="Inkbird INT-12-BW data logger")
    p.add_argument("--address", help="BLE MAC/UUID of the base station (skips scanning)")
    p.add_argument("--interval", type=float, default=5.0, help="poll/record interval seconds")
    p.add_argument("--simulate", action="store_true", help="generate fake cook data (no hardware)")
    p.add_argument("--time-scale", type=float, default=1.0,
                   help="simulator speed-up factor (e.g. 60 = 1 min real -> 1 h cook)")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    log.info("database: %s", db.db_path())
    asyncio.run(run_simulator(args) if args.simulate else run_ble(args))


if __name__ == "__main__":
    main()
