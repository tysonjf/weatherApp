"""Inkbird INT-12-BW BBQ thermometer -> Claude Code integration.

Two entry points:

- ``inkbird-logger`` (``inkbird_bbq.logger``): a long-running process that
  connects to the thermometer base station over Bluetooth LE, authenticates,
  and records probe temperatures to a local SQLite database.
- ``inkbird-mcp`` (``inkbird_bbq.server``): an MCP stdio server exposing the
  recorded data (live readings, cook sessions, trends, ETA, stall detection)
  as tools for Claude.

The BLE protocol implementation follows the reverse-engineered specification
published at https://github.com/paul43210/inkbird-bw-ble (MIT).
"""

__version__ = "0.1.0"
