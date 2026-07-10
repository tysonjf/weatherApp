"""Auth algorithm verified against the 17 captured challenge/response pairs
published in the protocol spec (github.com/paul43210/inkbird-bw-ble)."""

from inkbird_bbq import auth

# (challenge hex, expected 7-byte response body hex)
VECTORS = [
    ("2a19e11e78aa", "e2019f5a186a78"),
    ("a00e0f1e07ce", "92009259186afd"),
    ("5d734b60667d", "2100e45a186a9c"),
    ("b806c756e057", "0e03cd57186aa1"),
    ("47377c8de21e", "a401135b186aa5"),
    ("4a6db7788717", "7201f157186a87"),
    ("596c67b2e5d3", "80003a5b186a8f"),
    ("ec7039b602f2", "64033158186a4c"),
    ("cb6ec0dcf745", "1e02665b186a54"),
    ("3e3548d38de7", "52015058186ae8"),
    ("b5af2104872d", "41038f5b186a78"),
    ("b0b70b26dcec", "6d01265d186a2a"),
    ("ffa2421a66a9", "2b00a75b186a24"),
    ("d228101ad821", "aa02325f186aa0"),
    ("8950e5402fc7", "2f02cf5b186a85"),
    ("6ba0ca5c6ee9", "2103ec5b186a10"),
    ("2daa38762211", "d201075c186a2b"),
]


def _timestamp_from_body(body: bytes) -> tuple[int, int]:
    """Recover (epoch_seconds, millis_rem) embedded in a response body."""
    rem = body[0] | (body[1] << 8)
    epoch = body[2] | (body[3] << 8) | (body[4] << 16) | (body[5] << 24)
    return epoch, rem


def test_all_published_vectors():
    for challenge_hex, expected_hex in VECTORS:
        challenge = bytes.fromhex(challenge_hex)
        expected = bytes.fromhex(expected_hex)
        epoch, rem = _timestamp_from_body(expected)
        assert auth.build_verify_body(challenge, epoch, rem) == expected


def test_worked_example_from_spec():
    challenge = bytes.fromhex("2a19e11e78aa")
    body = auth.build_verify_from_millis(challenge, 1779980959482)
    assert body == bytes.fromhex("e2019f5a186a78")


def test_verify_frame_shape():
    frame = auth.verify_frame(bytes(6), millis=1779980959482)
    assert frame[0] == 0x08  # length byte: TYPE + 7-byte body
    assert frame[1] == 0xFC
    assert len(frame) == 9


def test_hello_frame():
    assert auth.hello_frame() == bytes([0x01, 0xFB])


def test_clock_sync_frame():
    frame = auth.clock_sync_frame(millis=1779980959482)
    assert frame[0] == 0x07
    assert frame[1] == 0x19
    assert frame[2:6] == (1779980959).to_bytes(4, "little")
    assert frame[6:8] == (482).to_bytes(2, "little")


def test_rejects_bad_challenge_length():
    import pytest

    with pytest.raises(ValueError):
        auth.build_verify_body(b"\x00" * 5, 0, 0)
