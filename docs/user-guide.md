# User Guide

This guide explains the day-to-day workflow in Rusty CAN Studio. It is written for people using the app to inspect CAN or CAN-FD traffic, decode frames with JSON profiles, transmit frames, and run repeatable simulator sequences.

## What You Need First

For offline log analysis:

- a candump log file
- optional profile JSON files for decoding

For live capture and transmit:

- `can_bridge_daemon` running on Linux or WSL
- a SocketCAN interface such as `vcan0`, `can0`, or `can1`
- a Remote Daemon connection profile in the app

## Main Areas

| Area | Use it for |
| --- | --- |
| CAN Monitor | Load logs, capture live frames, filter, sort, decode, export, and stage TX frames. |
| Profile Editor | Load, inspect, and edit JSON profiles used for decoding. |
| CAN Simulator | Build multi-step send, wait, cyclic, and delay workflows. |
| Settings | Configure theme, density, localization, diagnostics, trace archive, and backups. |
| Help | Read and edit the built-in help content. |

## CAN Monitor

CAN Monitor is the primary workspace. It shows loaded candump logs or live frames from the daemon.

### Open a candump file

1. Open CAN Monitor.
2. Select Open.
3. Choose a `.log`, `.txt`, or `.candump` file.
4. Confirm that the monitor title shows the loaded file name.
5. Select a row to inspect decoded details.

Loaded logs keep source file order. The line number column shows the original line number from the file, even after filtering or sorting.

### Connect to live traffic

1. Start `can_bridge_daemon` where the SocketCAN interface exists.
2. Select Connect.
3. Choose Remote Daemon.
4. Enter host and WebSocket port.
5. Use Discover to list interfaces.
6. Select an interface.
7. Save and Connect.

Live capture appends new frames at the bottom. When auto-follow is active, the table keeps the newest frame visible.

### Read TX status

| Status | Meaning |
| --- | --- |
| `TX:pending` | The app sent a request and is waiting for daemon acknowledgement. |
| `TX:sent` | The daemon accepted the send call for the selected interface. |
| `TX:failed` | The daemon, connection, or interface rejected the send request. |

`TX:sent` is not a target-device response. Use Wait for CAN response or a simulator sequence when the workflow depends on a received response.

## Display Filters

The display filter sits above the trace table. It hides rows without deleting them.

Examples:

```text
canId == 0x18203C01
service_identifier == 810
payload contains "01 01"
message_good == bad
error
hasError == true
errorCode == 12
dir == "TX"
```

Use column header context menus to build filters without typing the whole expression. You can replace the current filter, append with AND, append with OR, or insert an editable condition.

Save useful filters as presets when the same investigation repeats.

## Sorting and Pagination

Loaded candump logs support pagination. Live capture is not paginated because the newest frames should keep arriving continuously.

For loaded logs, you can:

- choose rows per page
- move to first, previous, next, or last page
- sort by one or more columns
- save sort presets

Sorting happens after display filtering and before pagination.

## Profiles and Decoding

Profiles are JSON files that explain how raw CAN IDs, payload headers, payload values, and errors should be decoded.

### Load profiles

1. Open Profile Editor.
2. Load one or more JSON profile files.
3. Load a shared CAN ID layout profile if the service profiles reference one.
4. Return to CAN Monitor.
5. Select a matching frame and inspect Decoded Preview.

The decoder is conservative. If a frame does not match a loaded profile, the monitor should not borrow field names or value dictionaries from unrelated profiles.

### Edit a profile

Use Visual view for structured editing and JSON view for direct source editing.

Common edits:

- service name and identifier
- payload header fields
- attribute names and addresses
- operations and feature indexes
- command, response, or event payload fields
- value maps
- error status dictionary

Use Decoded Preview while editing to check the selected frame against the current profile definition.

## Transmit Composer

Use Transmit Composer for quick manual sends and simple cyclic transmission.

### Send one frame

1. Connect to a remote daemon.
2. Enter CAN ID, payload, DLC, CAN-FD, and BRS.
3. Select Send Frame.
4. Watch the monitor for TX status.

You can also right click a monitor row and choose Use in Transmit Composer.

### Cyclic TX

Cyclic TX repeatedly sends the current composer frame.

Choose:

- period value and unit
- fire-and-forget, wait for daemon ACK, or wait for CAN response
- expected response from loaded profiles
- response timeout
- late-response policy
- retry count

Use cyclic TX for one repeated request. Use CAN Simulator for chained behavior.

## CAN Simulator

CAN Simulator is for repeatable workflows that are bigger than one frame.

A sequence can contain:

- Send Once
- Wait For Response
- Send Cyclic
- Delay
- Branch

Example:

```text
1. Send command A once.
2. Wait for response A with message_good == 1.
3. Send command B cyclically every 100 ms.
4. Stop when response B arrives or timeout policy fails.
```

Simulator logs stay available when switching views. Scenario-related frames also appear in CAN Monitor.

## Export and Archive

CAN Monitor can export:

- raw candump log
- decoded CSV for the current table view

Settings can export:

- application settings backup
- diagnostics log
- historical trace archive entries

Review exported files before sharing. They can include host names, interface names, CAN IDs, decoded field names, error text, and timing data.

## Settings

Use Settings for:

- theme and color palette
- density: comfortable, compact, dense
- localization and text direction
- diagnostics log
- historical traces
- settings backup and restore

Density affects monitor rows, decoded preview tables, panel spacing, and controls.

## Keyboard Shortcuts

Open Help > Keyboard Shortcuts to inspect and edit shortcuts.

Useful defaults:

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+P` | Command palette |
| `F1` | Help |
| `Arrow Up/Down` | Move monitor row selection |
| `Page Up/Down` | Move by one page |
| `Home/End` | First or last row |
| `Enter` | Toggle row details |

On macOS-style keyboards, use Command where the app indicates it for search-like behavior.

## Recommended Workflows

### Offline decode workflow

1. Load profile JSON files.
2. Open candump log.
3. Filter to a service, CAN ID, or error state.
4. Inspect Decoded Preview.
5. Export decoded CSV if needed.

### Live investigation workflow

1. Start the daemon and connect.
2. Load profiles.
3. Apply a narrow display filter.
4. Capture the event.
5. Save a historical trace or export candump.

### Transmit workflow

1. Find a known frame in CAN Monitor.
2. Right click and stage it into Transmit Composer.
3. Adjust payload or CAN ID if needed.
4. Send once.
5. Use Wait for CAN response if the next action depends on an RX frame.

## Safety Notes

- Do not transmit on a physical bus unless you understand the target system.
- Use daemon capture filters carefully; a wrong mask can hide required responses.
- Treat profiles as executable decoding configuration. Review them before using them for analysis.
- `TX:sent` only confirms daemon/interface acceptance, not target-device behavior.
- Review logs, diagnostics, and profiles before sharing.
