# Inkbird BBQ → Claude Code

Connect an **Inkbird INT-12-BW** wireless BBQ thermometer to Claude Code, so
Claude can watch your cook, chart the temperature trend, detect the stall,
estimate when the meat will be done, and tell you what to do next.

```
┌─────────────┐   Bluetooth LE   ┌────────────────┐    SQLite    ┌─────────────┐
│ INT-12-BW   │ ───────────────▶ │ inkbird-logger │ ───────────▶ │ inkbird-mcp │──▶ Claude
│ base station│  (auth + poll)   │ (records temps)│  ~/.inkbird- │ (MCP tools) │
└─────────────┘                  └────────────────┘   bbq/*.db   └─────────────┘
```

## Why this approach

Options investigated:

1. **Inkbird cloud API** — there is none. Inkbird has ignored years of
   [community requests](https://community.inkbird.com/t/api-for-temp-sensors/10279)
   for API/export access, so the app's cloud data is a dead end.
2. **Home Assistant** — the official [INKBIRD integration](https://www.home-assistant.io/integrations/inkbird/)
   works, but requires running a whole Home Assistant install.
3. **Direct Bluetooth LE** ✅ — the INT-12-BW's BLE protocol (including its
   authentication handshake) was reverse-engineered and published at
   [paul43210/inkbird-bw-ble](https://github.com/paul43210/inkbird-bw-ble)
   (MIT). This repo implements that protocol in Python with
   [bleak](https://github.com/hbldh/bleak), which works on macOS, Windows and
   Linux — any computer with Bluetooth within range of the base station.

The thermometer can only hold a connection with one client at a time, so
**close the Inkbird app** (or at least its live connection) while the logger
is running.

## Setup

Requires Python 3.10+ on a computer with Bluetooth.

```sh
git clone <this repo> inkbird-bbq && cd inkbird-bbq
python3 -m venv .venv && .venv/bin/pip install -e .
```

Register the MCP server with Claude Code:

```sh
claude mcp add inkbird-bbq -- /path/to/inkbird-bbq/.venv/bin/inkbird-mcp
```

## Usage

When you start a cook, run the logger (leave it running for the whole cook):

```sh
.venv/bin/inkbird-logger            # scans for the base station, connects, records
```

…or just ask Claude to start it — the MCP server has a `start_logger` tool.

Then talk to Claude:

> *"The brisket just went on, target 95°C internal. Track this cook."*
> → Claude calls `start_cook(name="brisket", target_internal_c=95)`
>
> *"How's it going? When should I wrap?"*
> → Claude calls `analyze_cook` and reads back the trend, stall status, and ETA.

### MCP tools

| Tool | What it does |
|---|---|
| `get_live_status` | Live temps (food + pit per probe), batteries, logger health |
| `start_cook` / `end_cook` | Track a cook session with a target temperature |
| `add_cook_note` | Timestamped events ("wrapped", "added charcoal") |
| `analyze_cook` | Heating rate, **stall detection**, **ETA to target**, pit stability |
| `get_cook_history` | Downsampled time series for charting the cook curve |
| `list_cooks` | Past cook sessions |
| `start_logger` / `stop_logger` | Manage the background BLE logger |

## Using it from your phone

Run the logger + MCP server on a laptop near the smoker, then interact from
the Claude app on your phone. Two ways:

### Option A (recommended): Claude Code Remote Control

Claude Code can hand control of a laptop session to your phone — the session
(and its local MCP servers, i.e. this one) keeps running on the laptop.

```sh
claude remote-control          # on the laptop, in this repo
```

Press space to show a QR code, scan it with the Claude mobile app (or find
the session under Code in the app / claude.ai/code). Requires a Pro/Max/Team
plan, Claude Code >= 2.1.51, and claude.ai login (not an API key). Keep the
laptop awake and the terminal open (`caffeinate` on macOS helps).

### Option B: custom connector (plain Claude chats, no Claude Code session)

Serve MCP over HTTP and expose it through a tunnel:

```sh
.venv/bin/inkbird-mcp --http --token pick-a-long-random-string
cloudflared tunnel --url http://127.0.0.1:8787     # or: ngrok http 8787
```

Then add `https://<tunnel-domain>/<your-token>/mcp` at
[claude.ai/settings/connectors](https://claude.ai/settings/connectors) →
Add custom connector. Connectors sync to the mobile app, so any chat on your
phone can call the BBQ tools.

Notes: quick tunnels get a new random domain each run, so you'd re-paste the
connector URL — a named Cloudflare tunnel or ngrok reserved domain gives a
stable one. The secret path token is the only access control; anyone with
the full URL can read your cook data and start/stop the logger, so keep it
private and pick a long token.

### Testing without the thermometer

```sh
.venv/bin/inkbird-logger --simulate --time-scale 60   # 1 real min = 1 cook hour
```

generates a realistic brisket-style curve (pit ramp, Newtonian meat rise, a
stall around 70 °C) so the whole pipeline can be exercised indoors.

## Notes & caveats

- Data is stored in `~/.inkbird-bbq/inkbird.db` (override with `INKBIRD_DB`).
  All temperatures are stored in °C; tools report both °C and °F.
- v1 is **read-only**: it doesn't write settings (target temps, alarms) to the
  device, because one scaling question in the write path is still unverified
  upstream. Set alarms on the unit or in the app before handing over to the
  logger.
- The auth implementation is validated against all 17 published
  challenge/response captures (`tests/test_auth.py`), but this code has not
  yet been run against real hardware — if the device kicks the connection
  after ~30 s, that's the auth failing; open an issue/ask Claude to debug
  with `inkbird-logger -v`.

## Credits

- BLE protocol spec & auth algorithm: [paul43210/inkbird-bw-ble](https://github.com/paul43210/inkbird-bw-ble)
  (MIT) — a copy of the spec lives in [`docs/protocol.md`](docs/protocol.md).
