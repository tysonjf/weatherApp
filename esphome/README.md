# ESP32 bridge: thermometer → your website for ~$10

Runs on a **Seeed XIAO ESP32-C6** (or any BLE-5 ESP32 board). The board
authenticates to the INT-12-BW over Bluetooth, then POSTs a reading to your
Cloudflare app (see [`../web/`](../web/)) every 30 s over Wi-Fi. No laptop,
no Raspberry Pi, no Home Assistant — just the board and a USB phone charger.

```
INT-12-BW ──BLE──▶ XIAO ESP32-C6 (this config) ──Wi-Fi/HTTPS──▶ web/ on Cloudflare
```

The BLE protocol implementation is adapted from
[paul43210/inkbird-bw-ble](https://github.com/paul43210/inkbird-bw-ble) (MIT),
whose ESPHome bridge was validated on this exact board + thermometer combo.
`inkbird_auth.h` is vendored from there unchanged.

## Flash it (one-time; any computer with USB, ~15 minutes)

1. Find your base station's BLE MAC address: install a free BLE scanner app
   (e.g. **nRF Connect**) on your phone, power the base station on, and look
   for the device advertising as `Int12bw`-ish. Note its MAC
   (`AA:BB:CC:DD:EE:FF` format). Close the Inkbird app afterwards — the
   thermometer only accepts one client at a time.
2. `cp secrets.yaml.example secrets.yaml` and fill in Wi-Fi credentials plus
   the upload URL/token of your deployed web app.
3. Edit `inkbird_mac` at the top of `inkbird-bridge.yaml`.
4. Install ESPHome and flash over USB:

   ```sh
   pip install esphome
   esphome run inkbird-bridge.yaml     # pick the USB port when prompted
   ```

5. Watch the logs: you should see `Captured challenge` →
   `AUTH ACCEPTED` → `reading uploaded`. Then unplug it from the computer
   and plug it into any USB charger near the smoker. Done.

Future config changes flash over Wi-Fi (`esphome run` again — it finds the
board on the network; no USB needed).

## Behaviour & caveats

- Reconnects automatically when the thermometer powers on/off or goes out of
  range; uploads simply pause while there's no data.
- Readings are only uploaded live — the ESP32 has no disk, so if your Wi-Fi
  or the website is down, those minutes are gaps in the chart (unlike the
  Python logger on a Pi/laptop, which backfills from its local queue).
- Upload-only: it doesn't write settings to the thermometer. Set alarms on
  the unit or in the Inkbird app before the cook.
- The web dashboard's "logger may be offline" hint works the same: if the
  latest reading is older than a couple of minutes, check the board's power
  and Wi-Fi.
