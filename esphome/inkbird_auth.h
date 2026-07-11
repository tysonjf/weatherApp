// Inkbird INT-12-BW / INT-14-BW BLE auth helpers
// Reverse-engineered from Idt34Helper.getBleGetVerifyCode() in the
// decompiled Inkbird Android app (com.inkbird.inkbirdapp 2.1.8).
// Verified bit-exact against 17 captured (challenge, response) vectors.
//
// Frame format on FF02: <LEN><TYPE>[PAYLOAD...] where LEN counts TYPE+PAYLOAD.
//
// Auth handshake:
//   Phone -> Dev:  01 fb                 (request challenge)
//   Dev   -> Phone: 07 fb <6 bytes>      (random challenge per session)
//   Phone -> Dev:  08 fc <7 bytes>       (verify response, built here)
//
// The 7-byte response is the phone's wall-clock time (NOT device uptime) plus
// one CRC byte that folds in the challenge. Device validates CRC chain only
// and has no RTC at auth time, so any plausible epoch works.

#pragma once
#include <cstdint>
#include <cstddef>
#include <vector>
#include <sys/time.h>

namespace inkbird_proto {

// Non-reflected MSB-first CRC-8 (RefIn=RefOut=false, XorOut=0).
static inline uint8_t crc8(const uint8_t *data, size_t len, uint8_t poly, uint8_t init) {
  uint8_t crc = init;
  for (size_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (int b = 0; b < 8; b++)
      crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ poly) : (uint8_t)(crc << 1);
  }
  return crc;
}
static inline uint8_t crc8_dvbs2(const uint8_t *d, size_t n)    { return crc8(d, n, 0xD5, 0x00); }
static inline uint8_t crc8_cdma2000(const uint8_t *d, size_t n) { return crc8(d, n, 0x9B, 0xFF); }

// Build the 9-byte FF02 frame "08 fc <7 byte response>" given the 6-byte
// challenge (the bytes after 07 fb). Pulls current wall-clock time itself.
static inline std::vector<uint8_t> build_fc_frame(const uint8_t *challenge_6) {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  uint32_t epoch  = (uint32_t)tv.tv_sec;
  uint16_t ms_rem = (uint16_t)(tv.tv_usec / 1000);  // 0..999

  uint8_t body[7];
  body[0] = (uint8_t)(ms_rem & 0xFF);
  body[1] = (uint8_t)((ms_rem >> 8) & 0xFF);
  body[2] = (uint8_t)(epoch & 0xFF);
  body[3] = (uint8_t)((epoch >> 8) & 0xFF);
  body[4] = (uint8_t)((epoch >> 16) & 0xFF);
  body[5] = (uint8_t)((epoch >> 24) & 0xFF);

  uint8_t buf8[8];
  for (int i = 0; i < 6; i++) buf8[i] = body[i];
  buf8[6] = crc8_dvbs2(body, 6);
  buf8[7] = crc8_cdma2000(challenge_6, 6);
  body[6] = crc8_dvbs2(buf8, 8);

  return std::vector<uint8_t>{0x08, 0xFC,
                              body[0], body[1], body[2], body[3],
                              body[4], body[5], body[6]};
}

// Build the 8-byte clock-sync frame "07 19 <epoch LE32> <ms_rem LE16>".
// Same time data as auth but pure little-endian, used after auth accepts.
static inline std::vector<uint8_t> build_clock_sync() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  uint32_t epoch  = (uint32_t)tv.tv_sec;
  uint16_t ms_rem = (uint16_t)(tv.tv_usec / 1000);

  return std::vector<uint8_t>{
    0x07, 0x19,
    (uint8_t)(epoch & 0xFF),
    (uint8_t)((epoch >> 8) & 0xFF),
    (uint8_t)((epoch >> 16) & 0xFF),
    (uint8_t)((epoch >> 24) & 0xFF),
    (uint8_t)(ms_rem & 0xFF),
    (uint8_t)((ms_rem >> 8) & 0xFF),
  };
}

}  // namespace inkbird_proto
