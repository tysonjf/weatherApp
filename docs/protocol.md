# Inkbird INT-12-BW / INT-14-BW BLE Protocol Specification

Reverse-engineered from the decompiled Android app `com.inkbird.inkbirdapp`
(verified identical in **2.1.6.2-178** and **2.1.8.1-183**) for the purpose of
building an interoperable Home Assistant / ESP32 bridge that holds a persistent
BLE connection.

This protocol family is shared by the whole Inkbird INT/IBT/Bbq line
(`Int12bwItem`, `Int14bwItem`, `Bbq4bwItem`, `Ibt26sItem`, `INT11IItem`,
`INT21bItem`, …). The auth function in particular (`Idt34Helper`) is common to all.

- Decompiled tree: `/mnt/ml-cache/inkbird-decompiled-2.1.8/sources/`
- Captures: `hci/btsnoop_hci-*.log`
- Reference implementations: see [§11](#11-reference-implementations) (also `/tmp/inkbird_auth/auth.py`, `inkbird_auth.cpp`)

---

## 1. GATT layout

| UUID | Role |
|---|---|
| `0000ff00-…` | Primary service |
| `0000ff01` | Current temperature (read/notify) |
| `0000ff02` | **Control** — commands in, responses/state out (read/write/notify) |
| `0000ff03` | Device state array (read/notify) |
| `0000ff04` | Event/alarm push (notify; not parsed by home tile) |
| `0000ff05` | Event/alarm push (notify) |
| `0000ff06` | Event/alarm push (notify) |
| `00002a19` | Battery level (standard Battery char; read/notify) |

The client subscribes to notifications on FF01–FF06 and 2A19, then drives the
session over FF02. All multi-byte temperature/time values on the wire are
**little-endian** unless stated otherwise.

Source: `home/item/deviceitem/Int12bwItem.java:initCharacteristics`,
`device/common/utils/bbq/INTConstant.java`.

---

## 2. Frame format

Every FF02 payload is one or more concatenated frames:

```
<LEN> <TYPE> [PAYLOAD…]
 1B    1B     LEN-1 bytes
```

`LEN` = number of bytes in `TYPE`+`PAYLOAD` (i.e. total frame length minus the
length byte itself), encoded as one hex byte.
Builder: `INT14Tools.getDataLength(s) = intToHex2(s.length()/2, 2)`
(`int14bw/utils/INT14Tools.java:211`).

Example — brightness 100 %:  payload `05 64` (2 bytes) → frame `02 05 64`.

The app frequently writes **several frames back-to-back in one characteristic
write** (e.g. target-temp = a `01…` frame immediately followed by a `23…`
frame; the init blob is ~17 frames concatenated).

---

## 3. Connection lifecycle

1. Central (phone/bridge) connects, discovers services, subscribes to
   notifications on FF01–FF06 + 2A19.
2. **Auth handshake** over FF02 (§4).
3. **Clock sync** `07 19 …` (§7) + **init read blob** (§8).
4. Steady state: poll current temp/state/battery; receive notifications;
   send setting commands.

If the `08 fc` auth response is missing or wrong, the device terminates the link
with `0x13 REMOTE_USER_TERMINATED` after ~30 s and silently ignores FF02 writes
in the meantime. A correct response makes the device hold the link indefinitely.

---

## 4. Authentication handshake

Three FF02 frames (the leading byte of each is a **length**, per §2 — the
"`07`/`08`" seen on the wire are not opcodes):

```
Phone → Dev:  01 fb                         hello / request challenge
Dev → Phone:  07 fb <6 random bytes>        challenge (fresh per session)
Phone → Dev:  08 fc <7 bytes>               verify response  ← must be correct
```

Handler: `Int12bwItem.onCharacteristicRead` (`:293`) detects an FF02 value whose
body (after the length byte) starts with `fb`, and calls:

```java
Idt34Helper.getBleGetVerifyCode(challengeHex, String.valueOf(System.currentTimeMillis()))
```

The 7-byte reply is then written as `intToLen(len) + "fc" + verifyCode` (`:296`,
message case 3) → `08 fc <7 bytes>`.

### 4.1 Algorithm (`device/idt34/utils/Idt34Helper.java:188`)

The second argument is the **phone's wall-clock `System.currentTimeMillis()`** as
a 13-digit decimal string. The challenge contributes only to the final checksum
byte.

```
epoch_seconds    = int(str(millis)[0:10])     # == millis // 1000
millis_remainder = int(str(millis)[10:13])     # == millis % 1000   (0..999)

body[0] = millis_remainder        & 0xFF
body[1] = (millis_remainder >> 8) & 0xFF       # 0..3
body[2] =  epoch_seconds          & 0xFF       # epoch as uint32, little-endian
body[3] = (epoch_seconds  >>  8)  & 0xFF
body[4] = (epoch_seconds  >> 16)  & 0xFF
body[5] = (epoch_seconds  >> 24)  & 0xFF

inner = CRC8_DVB_S2(body[0..5])                # intermediate, not transmitted
cdma  = CRC8_CDMA2000(challenge_6_bytes)       # the ONLY challenge-derived value
body[6] = CRC8_DVB_S2( body[0..5] + inner + cdma )
```

The transmitted body is `body[0..6]` (7 bytes); `inner` and `cdma` are internal.
The device validates by recomputing `cdma` from its own challenge and `inner`
from the received 6 bytes, then checking `body[6]`. It is effectively a MAC over
the challenge.

### 4.2 CRC parameters (`base/crc/Crc8.java`, both non-reflected)

| Name | Poly | Init | RefIn/Out | XorOut |
|---|---|---|---|---|
| CRC-8/DVB-S2 | `0xD5` | `0x00` | false | `0x00` |
| CRC-8/CDMA2000 | `0x9B` | `0xFF` | false | `0x00` |

### 4.3 Consequences for a bridge

- The "uptime"/"device-ID" fields hypothesised from snoops are **not** device
  values. body[2..5] = phone epoch seconds (LE32); body[0..1] = ms remainder.
  The constant-looking `18 6a` is just the high half of epoch seconds in 2026.
- The device **cannot validate the timestamp value** (it has no independent
  clock reference at auth time), so epoch/ms are effectively free parameters —
  only the CRC relationship is checked. Use real SNTP time to match the app, but
  a fixed plausible value also passes.
- **Success signal:** after sending `08 fc …`, read **FF03 byte 40** — it flips
  to non-zero when the device accepts auth (§9, the `verify` flag). No need to
  wait out the 30 s kick to know it worked.

### 4.4 Worked example (test vector 1)

```
challenge = 2a 19 e1 1e 78 aa
millis    = 1779980959482   → epoch=1779980959, rem=482
response  = e2 01 9f 5a 18 6a 78
            └ms┘ └─ epoch LE32 ─┘ └CRC
```
All 17 captured vectors reproduce exactly (§11).

---

## 5. Command-type convention

**Write command `TYPE = N` → device reports that state via `TYPE = N+1`.**

| Domain | Set (write) | Report (notify/read) |
|---|---|---|
| Target temp | `01` | `02` |
| Temp unit | `03` | `04` |
| Brightness | `05` | `06` |
| Calibration | `09` | `0a` |
| Volume/mute | `0b` | `0c` |
| Alarm config | `10` | `11` |
| Pre-alarm | `23` | `24` |
| Cook timer | `25` | `26` |
| Name | `36` | `37` |
| Auto-sleep | `40` | `41` |

Exception: Wi-Fi mode (set `12`, report `42`). Device-info is read-only (`15`).
A value is "read" by writing a bare frame of the **report (even) type**; the
device answers with the same type.

---

## 6. Settings — write commands (phone → device, FF02)

All payloads shown **without** the leading length byte (prepend per §2). `mask` =
`2^(probe_index)` (probe 1 = `01`, probe 2 = `02`).

| Setting | Frame (incl. length) | Detail | Source |
|---|---|---|---|
| Brightness | `02 05 PP` | PP = 0–100 hex | `INT12BaseSetModel.java:102` |
| Temp unit | `02 03 43` (°C) / `02 03 46` (°F) | ASCII 'C'/'F' | `:88` |
| Volume | `03 0b 5a PP` / mute `03 0b 11 01` | ⚠ `5a`/`1101` literals — verify | `:113` |
| Wi-Fi mode | `02 12 01` (on) / `02 12 00` (off) | | `:166` |
| Rename base | `<L> 36 01 <utf8-hex>` | | `:139` |
| Rename probe | `<L> 36 02 <utf8>` (P1) / `36 03 …` (P2) | | `INT12ProbeSetModel.java:81` |
| Calibration | `<L> 09 <mask> <8 bytes>` | byte[probe-1]=internal, byte[probe+3]=ambient, signed ±, ÷10 °C | `:53` |
| Target temp | `09 01 <mask> 10 <hiLo hiHi> 00 00 <deg> <food>` | high LE16; low=`0000` (preset path); see §10 | `INT12DefaultFoodPresetModel.java:116` |
| └ paired pre-alarm | `06 23 <mask> <a0 a1 a2 a3>` | advance byte at [probe-1] | same |
| Alarm interval/times | `04 10 <mode> <times> <interval>` | mode `01`=interval, `11`=count | `INT12SelectListModel.java:49` |
| Auto-sleep | `04 40 <en> <secLo secHi>` | en `01`/`00`; sec = minutes×60 LE16 | `:62` |
| Cook timer set | `<L> 25 <mask\|0x80> <startLE32> <endLE32>` | bit7 of mask = countdown mode; times are LE32 epoch | `INT12CDActivity.java:300` |
| Cook timer clear | `03 27 <mask> 00` | | `:285` |
| Clear temp alarm | `02 0d 0f` | ack alarm types 0/1/10/11/14/15 | `INT12AlertModel.java:118` |
| Clear pre-alarm | `03 29 0f 00` | types 40/41 | `:135` |
| Clear low-power alarm | `02 35 1f` | types 50/51 (`commendStr` uses `02 35 0f`) | `:139` |
| Clock sync | `07 19 <epochLE32> <ms_remLE16>` | §7 | `INT12HomeModel.java:1111` |

Doneness codes (`INT14Tools.commendDegree:544`):
`00`=none, `01`=Rare, `03`=M.Rare, `05`=Medium, `07`=M.Well, `0a`=Done.

---

## 7. Clock sync (`07 19 …`)

`bleSynchronizationTime` (`INT12HomeModel.java:1111`) = `"19" + timeService()`,
framed → `07 19 <6 bytes>`. `timeService()` (`INT14Tools.java:167`) packs the
phone's wall clock as:

```
07 19 <epoch_seconds LE32> <millis_remainder LE16>
```

This is the same timestamp data used in auth (§4), arranged purely
little-endian. The device has no RTC; the phone sets its clock here. Any device
"seconds since boot" observed in telemetry derives from this synced value.

---

## 8. Init sequence (immediately after auth)

`getInitData` (`INT12HomeModel.java:365`) concatenates and writes:

```
07 19 <time>     clock sync (§7)
01 04            read unit
02 02 01         read target temp probe 1
02 02 02         read target temp probe 2
01 06            read brightness
02 0a ff         read calibration (all probes, mask ff)
01 0c            read mute/volume
01 11            read alarm config
01 42            read wifi mode
01 15            read device info (firmware, wifi MAC, probe addrs/rssi)
01 24            read pre-alarm
02 26 01         read cook timer probe 1
02 26 02         read cook timer probe 2
02 37 01         read base name
02 37 02         read probe 1 name
02 37 03         read probe 2 name
01 41            read auto-sleep
```

Current temperature / state / battery are then polled by writing
`02 f1 01  02 f1 03  02 f1 19` to FF02 (`Int12bwItemModel.bleReadCurrentInfo:164`).

---

## 9. Telemetry / entities (device → phone)

### 9.1 Settings-state via FF02 notifications

`parseCommendData` (`INT12HomeModel.java:422`) splits concatenated frames and
dispatches on the TYPE byte:

| Type | Entity | Parser |
|---|---|---|
| `02` | target temp / doneness per probe | `bleParseTargetTemp` |
| `04` | temp unit (`46`=°F else °C) | `bleParseDeviceUnit` |
| `06` | brightness level | `bleParseDisplayLight` |
| `0a` | calibration (internal & ambient, signed ÷10) | `bleParseTempCompen` |
| `0c` | volume / mute level | `bleParseMuteMode` |
| `11` | alarm mode / times / interval | `bleParsePresetWarnInfo` |
| `15` | firmware versions, Wi-Fi MAC, probe addrs/RSSI | `bleParseDeviceInfo` |
| `24` | pre-alarm advance per probe | `bleParsePreAlarmData` |
| `26` | cook timer start/end per probe (bit7 = countdown mode) | `bleParseTimeClock` |
| `37` | base + probe names (UTF-8) | `bleParseDeviceName` |
| `41` | auto-sleep seconds (LE16) | `bleParseAutoSleep` |
| `42` | Wi-Fi switch | `bleParseWifiMode` |

### 9.2 Current temperature — FF01

`Int12bwItemModel.parseCurrentTemp:58`. Per-probe internal & ambient as **signed
LE16 in tenths of °C** (the app converts to °F×10 via `raw*1.8 + 320`).

```
bytes 0-1  probe1 internal (°C×10, signed LE16)
bytes 2-3  probe1 ambient
byte  4    (reserved)
bytes 5-6  probe2 internal
byte  7    (reserved)
bytes 8-9  base/host ambient ("devTemp"; capped at 1310)
```

Sentinels: `32766` = error, `32767` = high / no probe, `32768` = low.
(Byte indexing per the app parse; confirm against captures for your exact
firmware.)

### 9.3 Battery — 2A19

`parseCurrentBattery:140`:

```
byte 0  base station power %
byte 1  probe 1 battery %
byte 2  probe 2 battery %
```

`7f` = invalid/absent; values capped at 100.

### 9.4 Device state — FF03

`parseDeviceStateData:169`. A **56-byte** array (one int per byte). Per-probe
16-byte block at offset `probe*16`:

| Offset (rel) | Meaning |
|---|---|
| `+0` | connected |
| `+1` | charging |
| `+3` | internal low alarm |
| `+4` | internal high alarm (cook done) |
| `+7` | internal over-high |
| `+8` | internal over-low |
| `+9` | pre-alarm (advance) |
| `+10` / `+11` | ambient over-high / over-low |
| `+12` | paired |
| `+13` | pair request |
| `+14` | battery alarm |
| `+15` | internal over-high (dup) |

Global bytes:

| Byte | Meaning |
|---|---|
| `32` | base charging |
| `33` | Wi-Fi switch |
| `34–37` | Wi-Fi state bits |
| **`40`** | **`verify` — auth accepted flag** |
| `43 + probe` | timer alarm |
| `47 + probe` | timer switch |
| `51` / `52` | base over-high / over-low temp |
| `54` | low power |

### 9.5 FF04 / FF05 / FF06

Subscribed for notifications but not parsed by the home tile; used as async
event/alarm/history push channels.

---

## 10. Temperature encoding notes

- **Sensor/telemetry** (FF01) is **°C × 10, signed LE16**. App converts to °F×10
  for display: `°F×10 = raw×1.8 + 320`.
- **Calibration** values are signed bytes, ÷10 °C.
- **Target temp** (`01` command) carries high/low as LE16. The app passes the
  preset's `tempH × 10`. Whether the device expects °C×10 or °F×10 at this point
  is the one unresolved scaling question — the conversion (if any) happens in the
  presenter above `commendTargetSet`. **Verify live** before relying on it.

---

## 11. Reference implementations

Validated against all 17 captured `(challenge → response)` pairs (17/17 pass).
Full copies in `/tmp/inkbird_auth/{auth.py,inkbird_auth.cpp}`.

### 11.1 Python (`auth.py`)

```python
def _crc8(data, poly, init):
    crc = init
    for b in data:
        crc ^= b & 0xFF
        for _ in range(8):
            crc = ((crc << 1) ^ poly) & 0xFF if (crc & 0x80) else (crc << 1) & 0xFF
    return crc

def crc8_dvbs2(d):    return _crc8(d, 0xD5, 0x00)
def crc8_cdma2000(d): return _crc8(d, 0x9B, 0xFF)

def build_verify_body(challenge, epoch_seconds, millis_rem):
    """Return the 7-byte body that follows '08 fc'."""
    b = [millis_rem & 0xFF, (millis_rem >> 8) & 0xFF,
         epoch_seconds & 0xFF, (epoch_seconds >> 8) & 0xFF,
         (epoch_seconds >> 16) & 0xFF, (epoch_seconds >> 24) & 0xFF]
    inner = crc8_dvbs2(b)
    cdma  = crc8_cdma2000(list(challenge))
    b.append(crc8_dvbs2(b + [inner, cdma]))
    return bytes(b)

def build_verify_from_millis(challenge, millis):
    s = str(millis)
    return build_verify_body(challenge, int(s[0:10]), int(s[10:13]))

def full_fc_frame(challenge, millis):
    body = build_verify_from_millis(challenge, millis)
    return bytes([len(body) + 1, 0xFC]) + body      # 08 fc <7 bytes>
```

### 11.2 C++ (ESPHome-friendly, `inkbird_auth.cpp`)

```cpp
#include <cstdint>
#include <cstddef>
#include <vector>

static uint8_t crc8(const uint8_t *d, size_t n, uint8_t poly, uint8_t init) {
  uint8_t c = init;
  for (size_t i = 0; i < n; i++) {
    c ^= d[i];
    for (int b = 0; b < 8; b++)
      c = (c & 0x80) ? (uint8_t)((c << 1) ^ poly) : (uint8_t)(c << 1);
  }
  return c;
}
static inline uint8_t crc8_dvbs2(const uint8_t *d, size_t n)    { return crc8(d, n, 0xD5, 0x00); }
static inline uint8_t crc8_cdma2000(const uint8_t *d, size_t n) { return crc8(d, n, 0x9B, 0xFF); }

// challenge = 6 bytes after "07 fb"; epoch_seconds from SNTP; millis_rem 0..999.
std::vector<uint8_t> inkbird_build_verify(const std::vector<uint8_t> &challenge,
                                          uint32_t epoch_seconds, uint16_t millis_rem) {
  uint8_t body[7];
  body[0] = millis_rem & 0xFF;
  body[1] = (millis_rem >> 8) & 0xFF;
  body[2] = epoch_seconds & 0xFF;
  body[3] = (epoch_seconds >> 8) & 0xFF;
  body[4] = (epoch_seconds >> 16) & 0xFF;
  body[5] = (epoch_seconds >> 24) & 0xFF;
  uint8_t buf8[8];
  for (int i = 0; i < 6; i++) buf8[i] = body[i];
  buf8[6] = crc8_dvbs2(body, 6);
  buf8[7] = crc8_cdma2000(challenge.data(), challenge.size());
  body[6] = crc8_dvbs2(buf8, 8);
  return std::vector<uint8_t>(body, body + 7);
}
```

### 11.3 Test vectors (`challenge → 08fc body`)

```
2a19e11e78aa  e2019f5a186a78      a00e0f1e07ce  92009259186afd
5d734b60667d  2100e45a186a9c      b806c756e057  0e03cd57186aa1
47377c8de21e  a401135b186aa5      4a6db7788717  7201f157186a87
596c67b2e5d3  80003a5b186a8f      ec7039b602f2  64033158186a4c
cb6ec0dcf745  1e02665b186a54      3e3548d38de7  52015058186ae8
b5af2104872d  41038f5b186a78      b0b70b26dcec  6d01265d186a2a
ffa2421a66a9  2b00a75b186a24      d228101ad821  aa02325f186aa0
8950e5402fc7  2f02cf5b186a85
6ba0ca5c6ee9  2103ec5b186a10
2daa38762211  d201075c186a2b
```

---

## 12. Source cross-reference

Paths relative to `/mnt/ml-cache/inkbird-decompiled-2.1.8/sources/com/inkbird/`.

| What | File:line |
|---|---|
| Auth dispatch (FF02 `fb` handler, sends `fc`) | `inkbirdapp/home/item/deviceitem/Int12bwItem.java:293` |
| **Auth algorithm** | `inkbirdapp/device/idt34/utils/Idt34Helper.java:188` |
| CRC engine / params | `base/crc/CrcCalculator.java`, `base/crc/Crc8.java`, `base/crc/CrcUtils.java` |
| Hex/int helpers | `base/utils/StringUtils.java` (`intToHex2:165`, `bytesToHexString:236`, `hexStringToBytes:251`) |
| Frame length | `inkbirdapp/device/int14bw/utils/INT14Tools.java:211` |
| Init blob | `inkbirdapp/device/int12bw/model/INT12HomeModel.java:365` |
| Notification dispatch (entities) | `…/INT12HomeModel.java:422` |
| Clock sync / time pack | `…/INT12HomeModel.java:1111`, `INT14Tools.java:167` |
| Base settings (brightness/unit/volume/wifi/rename) | `…/model/INT12BaseSetModel.java` |
| Probe settings (calibration/name) | `…/model/INT12ProbeSetModel.java` |
| Target temp + pre-alarm | `…/model/INT12DefaultFoodPresetModel.java:116`, `INT12DefaultSmokeModel.java:92` |
| Alarm interval / auto-sleep | `…/model/INT12SelectListModel.java` |
| Cook timer | `…/view/activity/INT12CDActivity.java:285,300` |
| Clear-alarm commands | `…/model/INT12AlertModel.java:118` |
| Live telemetry parsers | `inkbirdapp/home/model/device/Int12bwItemModel.java` (temp:58, battery:140, state:169) |

---

## 13. Open items / verify live

1. **Volume encoding** — the `5a`/`1101` literals in `changeVolume` are
   unexplained; capture a real volume change to confirm payload semantics.
2. **Target-temp unit/scaling** — °C×10 vs °F×10 at the `01` command boundary
   (§10).
3. **Auth timestamp freshness** — confirmed irrelevant to validation by static
   analysis (device can't check it); confirm the device doesn't separately reject
   wildly stale clocks.
4. **FF04/05/06 payloads** — async event channels, not decoded here.
5. **FF01 byte layout** — reserved bytes 4 and 7; confirm probe-2 ambient
   handling against captures.
