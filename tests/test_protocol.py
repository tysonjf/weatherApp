from inkbird_bbq import protocol


def test_split_frames_single():
    assert protocol.split_frames(bytes.fromhex("020564")) == [bytes.fromhex("0564")]


def test_split_frames_concatenated():
    data = bytes.fromhex("01fb" "020301" "07fbaabbccddeeff")
    frames = protocol.split_frames(data)
    assert frames == [
        bytes.fromhex("fb"),
        bytes.fromhex("0301"),
        bytes.fromhex("fbaabbccddeeff"),
    ]


def test_split_frames_truncated_tail():
    data = bytes.fromhex("020564" "05aa")  # second frame claims 5 bytes, has 1
    assert protocol.split_frames(data) == [bytes.fromhex("0564")]


def test_parse_ff01_normal():
    # probe1 internal 25.4°C (254 = 0xFE 0x00), ambient 110.0°C (1100 = 0x4C 0x04)
    # probe2 internal 63.5°C (635 = 0x7B 0x02), base 22.0°C (220 = 0xDC 0x00)
    data = bytes([0xFE, 0x00, 0x4C, 0x04, 0x00, 0x7B, 0x02, 0x00, 0xDC, 0x00])
    r = protocol.parse_ff01(data)
    assert r.probe1_internal == 25.4
    assert r.probe1_ambient == 110.0
    assert r.probe2_internal == 63.5
    assert r.base_ambient == 22.0


def test_parse_ff01_negative_and_sentinels():
    # probe1 internal -5.0°C (-50 = 0xCE 0xFF), probe1 ambient no_probe (32767)
    data = bytes([0xCE, 0xFF, 0xFF, 0x7F, 0x00, 0xFE, 0x7F, 0x00, 0x00, 0x80])
    r = protocol.parse_ff01(data)
    assert r.probe1_internal == -5.0
    assert r.probe1_ambient is None  # 32767 = no probe
    assert r.probe2_internal is None  # 32766 = error
    assert r.base_ambient is None  # 32768 = low


def test_parse_battery():
    r = protocol.parse_battery(bytes([100, 97, 0x7F]))
    assert r.base == 100
    assert r.probe1 == 97
    assert r.probe2 is None


def test_parse_ff03_flags():
    data = bytearray(56)
    data[0] = 1  # probe1 connected
    data[17] = 1  # probe2 charging
    data[40] = 1  # auth accepted
    s = protocol.parse_ff03(bytes(data))
    assert s.probe1_connected
    assert not s.probe2_connected
    assert s.probe2_charging
    assert s.auth_accepted


def test_device_name_matching():
    assert protocol.matches_device_name("INT-12-BW")
    assert protocol.matches_device_name("Ink@INT-12-BW-1234")
    assert protocol.matches_device_name("inkbird bbq")
    assert not protocol.matches_device_name("Kitchen Speaker")
    assert not protocol.matches_device_name(None)
