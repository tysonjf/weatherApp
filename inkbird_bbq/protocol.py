"""Frame building/parsing for the INT-12-BW vendor GATT service (0xFF00).

Protocol reference: https://github.com/paul43210/inkbird-bw-ble (MIT),
docs/protocol.md (a copy lives in this repo under docs/).

Characteristics used here:

    FF01  current temperatures       (read / notify)
    FF02  control channel            (write / notify)  — auth, settings, polls
    FF03  device state array         (read / notify)
    2A19  battery levels             (read / notify)

All temperatures on the wire are signed LE16 in tenths of a degree Celsius.
"""

from __future__ import annotations

from dataclasses import dataclass, field

UUID_SERVICE = "0000ff00-0000-1000-8000-00805f9b34fb"
UUID_TEMP = "0000ff01-0000-1000-8000-00805f9b34fb"
UUID_CONTROL = "0000ff02-0000-1000-8000-00805f9b34fb"
UUID_STATE = "0000ff03-0000-1000-8000-00805f9b34fb"
UUID_BATTERY = "00002a19-0000-1000-8000-00805f9b34fb"

# Substrings (lowercased) matched against advertised device names when scanning.
DEVICE_NAME_HINTS = ("int-12", "int12", "int-14", "int14", "inkbird", "ink@")

# Written to FF02 to poll current temp (f1 01), state (f1 03), battery (f1 19).
POLL_CURRENT_INFO = bytes.fromhex("02f10102f10302f119")

# Sentinel raw values in FF01 (read as unsigned LE16).
_SENTINELS = {32766: "error", 32767: "no_probe", 32768: "low"}

# FF03 global flags
STATE_VERIFY_BYTE = 40  # non-zero once the device has accepted our auth


def split_frames(data: bytes) -> list[bytes]:
    """Split a concatenated FF02 payload into individual <LEN><TYPE><...> frames.

    Returns each frame *without* its length byte (i.e. TYPE + payload).
    """
    frames = []
    i = 0
    while i < len(data):
        length = data[i]
        if length == 0 or i + 1 + length > len(data):
            break  # malformed / truncated tail
        frames.append(bytes(data[i + 1 : i + 1 + length]))
        i += 1 + length
    return frames


def _decode_temp(lo: int, hi: int) -> float | None:
    """Decode a signed LE16 tenths-of-°C value, mapping sentinels to None."""
    raw_u = lo | (hi << 8)
    if raw_u in _SENTINELS:
        return None
    raw = raw_u - 0x10000 if raw_u >= 0x8000 else raw_u
    return raw / 10.0


@dataclass
class TemperatureReading:
    """Decoded FF01 payload. Temperatures in °C; None = probe absent/error."""

    probe1_internal: float | None = None
    probe1_ambient: float | None = None
    probe2_internal: float | None = None
    probe2_ambient: float | None = None
    base_ambient: float | None = None


def parse_ff01(data: bytes) -> TemperatureReading:
    """Parse the 10-byte FF01 current-temperature payload.

    Layout (per spec §9.2): bytes 0-1 probe1 internal, 2-3 probe1 ambient,
    5-6 probe2 internal, 8-9 base/host ambient. Bytes 4 and 7 reserved.
    """
    r = TemperatureReading()
    if len(data) >= 2:
        r.probe1_internal = _decode_temp(data[0], data[1])
    if len(data) >= 4:
        r.probe1_ambient = _decode_temp(data[2], data[3])
    if len(data) >= 7:
        r.probe2_internal = _decode_temp(data[5], data[6])
    if len(data) >= 10:
        r.base_ambient = _decode_temp(data[8], data[9])
    return r


@dataclass
class BatteryReading:
    """Decoded 2A19 payload. Percent 0-100; None = invalid/absent (0x7f)."""

    base: int | None = None
    probe1: int | None = None
    probe2: int | None = None


def _decode_batt(v: int) -> int | None:
    if v == 0x7F:
        return None
    return min(v, 100)


def parse_battery(data: bytes) -> BatteryReading:
    r = BatteryReading()
    if len(data) >= 1:
        r.base = _decode_batt(data[0])
    if len(data) >= 2:
        r.probe1 = _decode_batt(data[1])
    if len(data) >= 3:
        r.probe2 = _decode_batt(data[2])
    return r


@dataclass
class DeviceState:
    """Selected flags from the 56-byte FF03 state array."""

    auth_accepted: bool = False
    probe1_connected: bool = False
    probe2_connected: bool = False
    probe1_charging: bool = False
    probe2_charging: bool = False
    base_charging: bool = False
    raw: bytes = field(default=b"", repr=False)


def parse_ff03(data: bytes) -> DeviceState:
    s = DeviceState(raw=bytes(data))

    def flag(i: int) -> bool:
        return i < len(data) and data[i] != 0

    # Per-probe 16-byte blocks start at probe_index * 16 (probe1 = index 0).
    s.probe1_connected = flag(0)
    s.probe1_charging = flag(1)
    s.probe2_connected = flag(16)
    s.probe2_charging = flag(17)
    s.base_charging = flag(32)
    s.auth_accepted = flag(STATE_VERIFY_BYTE)
    return s


def matches_device_name(name: str | None) -> bool:
    if not name:
        return False
    lowered = name.lower()
    return any(h in lowered for h in DEVICE_NAME_HINTS)
