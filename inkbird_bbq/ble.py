"""bleak-based BLE client for the INT-12-BW base station.

Connection lifecycle (per the reverse-engineered spec):

1. Scan for a device whose advertised name looks like an Inkbird INT unit
   (or use a pinned address).
2. Connect, subscribe to notifications on FF01 (temps), FF02 (control),
   FF03 (state) and 2A19 (battery).
3. Send ``01 fb`` on FF02; the device answers ``07 fb <challenge>``; reply
   with the CRC-chained ``08 fc <verify>`` frame. An unauthenticated link is
   dropped by the device after ~30 s.
4. Send a clock sync, then poll ``02 f1 01 02 f1 03 02 f1 19`` periodically —
   the device answers via FF01/FF03/2A19 notifications.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable

from bleak import BleakClient, BleakScanner

from . import auth, protocol

log = logging.getLogger("inkbird.ble")


class InkbirdBLEClient:
    """Maintains a connection to one base station and emits merged readings.

    ``on_reading`` is called with (temps_dict, batts_dict) whenever a fresh
    temperature notification arrives; battery/state are cached from their own
    notification channels.
    """

    def __init__(
        self,
        on_reading: Callable[[dict, dict], None],
        address: str | None = None,
        poll_interval: float = 5.0,
    ):
        self.on_reading = on_reading
        self.address = address
        self.poll_interval = poll_interval
        self._batts: dict[str, int | None] = {}
        self._state = protocol.DeviceState()
        self._challenge_event = asyncio.Event()
        self._challenge: bytes | None = None
        self.connected = False
        self.device_name: str | None = None

    async def discover(self, timeout: float = 15.0) -> str | None:
        """Return the address of the first Inkbird-looking device found."""
        if self.address:
            return self.address
        log.info("scanning for Inkbird INT-12-BW (%.0fs)...", timeout)
        devices = await BleakScanner.discover(timeout=timeout)
        for d in devices:
            if protocol.matches_device_name(d.name):
                log.info("found %s (%s)", d.name, d.address)
                self.device_name = d.name
                return d.address
        return None

    # ------------------------------------------------------------ callbacks

    def _on_ff01(self, _char, data: bytearray) -> None:
        r = protocol.parse_ff01(bytes(data))
        temps = {
            "probe1_internal": r.probe1_internal,
            "probe1_ambient": r.probe1_ambient,
            "probe2_internal": r.probe2_internal,
            "probe2_ambient": r.probe2_ambient,
            "base_ambient": r.base_ambient,
        }
        self.on_reading(temps, dict(self._batts))

    def _on_battery(self, _char, data: bytearray) -> None:
        b = protocol.parse_battery(bytes(data))
        self._batts = {"base": b.base, "probe1": b.probe1, "probe2": b.probe2}

    def _on_ff03(self, _char, data: bytearray) -> None:
        self._state = protocol.parse_ff03(bytes(data))

    def _on_ff02(self, _char, data: bytearray) -> None:
        for frame in protocol.split_frames(bytes(data)):
            if frame and frame[0] == 0xFB and len(frame) >= 7:
                self._challenge = frame[1:7]
                self._challenge_event.set()

    # ------------------------------------------------------------ main loop

    async def run_once(self, stop: asyncio.Event) -> None:
        """One connect->auth->poll session; returns when disconnected/stopped."""
        address = await self.discover()
        if not address:
            raise ConnectionError("no Inkbird device found during scan")

        disconnected = asyncio.Event()
        async with BleakClient(
            address, disconnected_callback=lambda _c: disconnected.set()
        ) as client:
            log.info("connected to %s", address)
            await client.start_notify(protocol.UUID_TEMP, self._on_ff01)
            await client.start_notify(protocol.UUID_CONTROL, self._on_ff02)
            await client.start_notify(protocol.UUID_STATE, self._on_ff03)
            try:
                await client.start_notify(protocol.UUID_BATTERY, self._on_battery)
            except Exception:  # some firmwares expose battery as read-only
                log.debug("battery notify unsupported; will poll instead")

            # --- auth handshake
            self._challenge_event.clear()
            await client.write_gatt_char(protocol.UUID_CONTROL, auth.hello_frame(), response=True)
            try:
                await asyncio.wait_for(self._challenge_event.wait(), timeout=10)
            except asyncio.TimeoutError:
                raise ConnectionError("device did not send auth challenge")
            assert self._challenge is not None
            await client.write_gatt_char(
                protocol.UUID_CONTROL, auth.verify_frame(self._challenge), response=True
            )
            log.info("auth response sent")

            # --- clock sync, then steady-state polling
            await client.write_gatt_char(
                protocol.UUID_CONTROL, auth.clock_sync_frame(), response=True
            )
            self.connected = True
            try:
                while not stop.is_set() and not disconnected.is_set():
                    try:
                        await client.write_gatt_char(
                            protocol.UUID_CONTROL, protocol.POLL_CURRENT_INFO, response=True
                        )
                    except Exception as e:
                        log.warning("poll write failed: %s", e)
                        break
                    try:
                        batt = await client.read_gatt_char(protocol.UUID_BATTERY)
                        self._on_battery(None, bytearray(batt))
                    except Exception:
                        pass
                    _, pending = await asyncio.wait(
                        [asyncio.create_task(stop.wait()), asyncio.create_task(disconnected.wait())],
                        timeout=self.poll_interval,
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for t in pending:
                        t.cancel()
            finally:
                self.connected = False
        log.info("disconnected from %s", address)

    async def run_forever(self, stop: asyncio.Event, on_state: Callable[[str], None] | None = None) -> None:
        """Reconnect loop with backoff until *stop* is set."""
        backoff = 2.0
        while not stop.is_set():
            try:
                if on_state:
                    on_state("connecting")
                started = time.time()
                await self.run_once(stop)
                if time.time() - started > 60:
                    backoff = 2.0  # session was healthy; reset backoff
            except Exception as e:
                log.warning("BLE session error: %s", e)
            if stop.is_set():
                break
            if on_state:
                on_state(f"reconnecting (retry in {backoff:.0f}s)")
            try:
                await asyncio.wait_for(stop.wait(), timeout=backoff)
            except asyncio.TimeoutError:
                pass
            backoff = min(backoff * 2, 60.0)
