"""BLE authentication for Inkbird INT-12-BW / INT-14-BW (and INT/IBT family).

The base station requires a challenge/response handshake on the FF02
characteristic within ~30 s of connecting, otherwise it drops the link and
ignores writes. The algorithm below was reverse-engineered from the official
Inkbird Android app and published (with test vectors) at
https://github.com/paul43210/inkbird-bw-ble (MIT license) — this module is a
port of that reference implementation.

Handshake over FF02:

    client -> device:  01 fb                  hello / request challenge
    device -> client:  07 fb <6 bytes>        random challenge
    client -> device:  08 fc <7 bytes>        verify response (this module)

The 7-byte response body packs the client's wall-clock time (ms remainder as
LE16, epoch seconds as LE32) followed by a checksum byte computed from a
two-stage CRC-8 chain that mixes in the challenge:

    inner = CRC8/DVB-S2(body[0..5])
    cdma  = CRC8/CDMA2000(challenge)
    body[6] = CRC8/DVB-S2(body[0..5] + inner + cdma)

The device only validates the CRC relationship, not the timestamp itself.
"""

from __future__ import annotations

import time


def _crc8(data: bytes | list[int], poly: int, init: int) -> int:
    crc = init
    for b in data:
        crc ^= b & 0xFF
        for _ in range(8):
            crc = ((crc << 1) ^ poly) & 0xFF if (crc & 0x80) else (crc << 1) & 0xFF
    return crc


def crc8_dvbs2(data: bytes | list[int]) -> int:
    return _crc8(data, 0xD5, 0x00)


def crc8_cdma2000(data: bytes | list[int]) -> int:
    return _crc8(data, 0x9B, 0xFF)


def build_verify_body(challenge: bytes, epoch_seconds: int, millis_rem: int) -> bytes:
    """Return the 7-byte body that follows the ``08 fc`` frame header."""
    if len(challenge) != 6:
        raise ValueError(f"challenge must be 6 bytes, got {len(challenge)}")
    b = [
        millis_rem & 0xFF,
        (millis_rem >> 8) & 0xFF,
        epoch_seconds & 0xFF,
        (epoch_seconds >> 8) & 0xFF,
        (epoch_seconds >> 16) & 0xFF,
        (epoch_seconds >> 24) & 0xFF,
    ]
    inner = crc8_dvbs2(b)
    cdma = crc8_cdma2000(challenge)
    b.append(crc8_dvbs2(b + [inner, cdma]))
    return bytes(b)


def build_verify_from_millis(challenge: bytes, millis: int) -> bytes:
    return build_verify_body(challenge, millis // 1000, millis % 1000)


def verify_frame(challenge: bytes, millis: int | None = None) -> bytes:
    """Full ``08 fc <7 bytes>`` FF02 frame answering *challenge*."""
    if millis is None:
        millis = int(time.time() * 1000)
    body = build_verify_from_millis(challenge, millis)
    return bytes([len(body) + 1, 0xFC]) + body


def hello_frame() -> bytes:
    """``01 fb`` — request a challenge from the device."""
    return bytes([0x01, 0xFB])


def clock_sync_frame(millis: int | None = None) -> bytes:
    """``07 19 <epoch LE32> <ms remainder LE16>`` — set the device clock."""
    if millis is None:
        millis = int(time.time() * 1000)
    epoch = millis // 1000
    rem = millis % 1000
    payload = bytes(
        [
            0x19,
            epoch & 0xFF,
            (epoch >> 8) & 0xFF,
            (epoch >> 16) & 0xFF,
            (epoch >> 24) & 0xFF,
            rem & 0xFF,
            (rem >> 8) & 0xFF,
        ]
    )
    return bytes([len(payload)]) + payload
