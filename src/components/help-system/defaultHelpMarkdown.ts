import examplesMarkdown from "../../../docs/examples.md?raw";

const examplesHelpMarkdown = examplesMarkdown
  .split(/\r?\n/)
  .map((line, index) => {
    if (index === 0 && line.startsWith("# ")) return "## Examples guide";
    if (line.startsWith("## ")) return `### ${line.slice(3).trim()}`;
    return line;
  })
  .join("\n");

export const defaultHelpMarkdown = `# 1. Getting Started & User Examples

Use the left navigation to switch between the monitor, simulator, profile editor, settings, and help views.

1. Open the CAN-FD monitor.
2. Select the active interface or connection profile.
3. Start capture.
4. Use filters to reduce the live trace to the frames you need.
5. Inspect decoded fields and payload bytes.

:::tip
Start with a narrow CAN ID filter when the bus is busy. It keeps the trace readable and makes search results more useful.
:::

## Guide: New user examples

Use these short examples as a first training path. They build from offline inspection to live capture, decoding, transmit, and simulator workflows.

### Example 1: inspect a candump log

1. Open CAN Monitor.
2. Select Open candump.
3. Choose a \`.log\`, \`.txt\`, or \`.candump\` file.
4. Select a row and inspect Decoded Preview.
5. Try a display filter such as \`canId == 0x18203C01\` or \`payload ~ "01 01"\`.

:::note
Loaded logs keep the original file order and source line numbers. Display filters hide rows visually but do not renumber the source log.
:::

### Example 2: load profiles and decode frames

1. Open Profile Editor.
2. Load the canonical profile JSON files for the messages you want to decode.
3. Return to CAN Monitor.
4. Select a frame and confirm that Decoded Preview shows CAN ID fields, payload common fields, message name, payload values, and error status.

:::warning
If a frame belongs to a service or message that is not covered by a loaded profile, it should not borrow names or value maps from unrelated profiles. Load the correct profile or inspect the raw values.
:::

### Example 3: connect to the remote daemon

1. Start \`can_bridge_daemon\` where the SocketCAN interface exists.
2. Open Connect.
3. Choose Remote Daemon.
4. Enter the WebSocket host and port.
5. Use Discover to list interfaces.
6. Select the interface and connect.

\`\`\`bash
cargo run -- --tcp-bind 0.0.0.0:9500 --ws-bind 0.0.0.0:9501 --grpc-bind 0.0.0.0:9502
\`\`\`

:::tip
For WSL testing, create \`vcan0\` first with \`sudo modprobe vcan\`, \`sudo ip link add dev vcan0 type vcan\`, and \`sudo ip link set up vcan0\`.
:::

### Example 4: send one frame

1. Connect to a remote daemon.
2. Open the transmit composer.
3. Enter CAN ID, DLC, payload, CAN-FD, and BRS settings.
4. Select Send Frame.
5. Watch CAN Monitor for \`TX:pending\`, \`TX:sent\`, or \`TX:failed\`.

:::note
\`TX:sent\` means the daemon accepted the send call for the selected interface. It does not mean the target device sent an application-level response.
:::

### Example 5: build a cyclic request

1. Load or capture a known request frame.
2. Right click the row and choose Use in Transmit Composer.
3. Open Cyclic TX settings.
4. Set the period, for example \`500 ms\`.
5. Set Send mode to Wait for CAN response.
6. Choose an expected response from loaded profiles.
7. Start cyclic TX and inspect matching RX rows.

### Example 6: create a simulator sequence

1. Open CAN Simulator.
2. Create a sequence with Send frame steps, Wait steps, or Wait for CAN response steps.
3. Run the sequence.
4. Watch step highlights, run log entries, and CAN Monitor rows.

### Example 7: save work for later

1. Open Connection Profiles to save remote daemon endpoints.
2. Open Profile Editor to save updated canonical profiles.
3. Save display filter and sort presets for repeated investigations.
4. Export settings when moving the same setup to another installation.

:::warning
Review exported traces, settings, diagnostics, and profile JSON before sharing. They can contain host names, CAN identifiers, decoded names, and timing data.
:::

## Guide: End-user guide

Use the end-user guide as the task-oriented reference for normal operation. It covers the main workspaces and the decisions users make during a real session.

### Daily workflow map

| Task | Where to go |
| --- | --- |
| Inspect loaded logs | CAN Monitor |
| Capture live traffic | CAN Monitor and Connect |
| Decode raw frames | Profile Editor plus CAN Monitor |
| Filter and sort rows | Display filter and column header menus |
| Send one frame | Transmit Composer |
| Send repeated frames | Cyclic TX |
| Run chained workflows | CAN Simulator |
| Save evidence | Export candump, export CSV, or Historical traces |
| Change appearance | Settings |

### Typical offline workflow

1. Load profile JSON files.
2. Open a candump log.
3. Filter to a service, CAN ID, payload value, or error state.
4. Inspect Decoded Preview.
5. Export decoded CSV or raw candump when needed.

### Typical live workflow

1. Start the daemon where the SocketCAN interface exists.
2. Connect from CAN Monitor.
3. Load matching profiles.
4. Apply a narrow display filter if the bus is busy.
5. Capture the event.
6. Save a historical trace or export evidence.

### Typical transmit workflow

1. Right click a known monitor row and stage it into Transmit Composer.
2. Adjust CAN ID, payload, DLC, CAN-FD, or BRS if needed.
3. Send once and inspect \`TX:pending\`, \`TX:sent\`, or \`TX:failed\`.
4. Use Wait for CAN response or CAN Simulator when the next action depends on a received frame.

:::warning
Do not transmit on a physical bus unless you understand the target system. Incorrect frames can disturb diagnostics, flashing, or control traffic.
:::

${examplesHelpMarkdown}

# 2. CAN Monitor & Display Filters

The CAN Monitor display filter is placed directly above the captured or loaded log table. It works across static columns, decoded CAN ID fields, decoded payload common fields, payload values, TX status fields, and raw payload text. It accepts simple Wireshark-style conditions and validates the expression while you type.

The filter box changes color:

- Neutral: no filter is active.
- Green: the filter syntax is valid.
- Red: the filter syntax is invalid, and the message below the box explains where parsing failed.

Filtering is deferred while typing so the input stays responsive on large traces. The table is virtualized, so only visible rows are rendered even when the trace contains many frames.

## Display mode: show only matches vs. highlight

Next to the filter box, a toggle switches how an active filter affects the table:

- **Show only matches** (default): non-matching rows are removed from the table entirely.
- **Highlight**: all rows stay visible, in their original order, with matching rows highlighted — useful for seeing a filtered signal in the context of the surrounding traffic instead of in isolation.

The status text next to the filter box reflects whichever mode is active (\`N/M frames\` for show-only, \`N/M frames highlighted\` for highlight mode).

## Reference: Filter examples

| Expression | Meaning |
| --- | --- |
| \`canId == 0x18203C01\` | Match exact 29-bit CAN ID |
| \`id == 0x123\` | Match standard 11-bit CAN ID |
| \`iface == vcan0\` | Match frames received on interface \`vcan0\` |
| \`dir == RX\` | Match received frames |
| \`dir == TX\` | Match transmitted frames |
| \`payload ~ "01 01"\` | Match hex sequence anywhere in payload |
| \`name ~ "control"\` | Match decoded message title |
| \`payload ~= "^01(\\s01)+$"\` | Regex match against the payload text |
| \`service_identifier == k2_focus_control\` | Match exact string enum signal |
| \`instance_index ~ FIELD\` | Match string enum by substring/prefix |
| \`txStatus == failed\` | Match failed transmissions |
| \`len > 4 and (dir == RX or dir == TX)\` | Parentheses and correct and/or precedence |
| \`time >= 1735000000000\` | Match frames at or after a millisecond timestamp |

:::tip
The clock icon next to the filter box opens a picker for \`time\` clauses — pick a date and time, or type a raw millisecond value directly, without typing the comparison by hand. The Time column only shows \`HH:MM:SS.mmm\`, with no date, so for a loaded candump log you may not know which date to pick — hover any row's Time cell to see its exact date and raw millisecond value, then either type that date into the picker or switch to its Raw (ms) tab and paste the number directly. Live capture timestamps are always today, so this only matters for loaded files.
:::

## Guide: Candump log import

You can also inspect an offline candump file without a running daemon.

1. Open CAN Monitor.
2. Click Open candump.
3. Select a candump text file, for example \`candump.log\` or \`a (1).txt\`.
4. The trace title changes from Live frame trace to Loaded <file name>.
5. Use search and right click actions exactly like live traffic.

The parser accepts common candump lines like:

\`\`\`text
(000.000000) can1 18203C01 [02] 01 01
\`\`\`

:::note
Loaded candump frames are decoded through the same loaded profile library as live frames. This lets you test profiles without hardware or a running WSL daemon.
:::

Loaded candump files keep the same order as the source log. The Line column shows the original source line number from the file. Live capture uses append-at-bottom ordering so the newest packet appears at the end of the table.

## Reference: CAN-FD basics

CAN-FD has three details that matter in this application:

| Concept | Meaning | Why it matters |
| --- | --- | --- |
| Nominal bitrate | Arbitration phase speed | All nodes must agree on arbitration timing |
| Data bitrate | Payload phase speed | Higher speed is possible when BRS is enabled |
| DLC | Encoded payload length | CAN-FD supports 0 to 64 bytes |

### Frame trace

The live trace shows timestamp, identifier, direction, DLC, CAN-FD mode, and decoded frame name. Use it to confirm that traffic is arriving and that the expected identifiers are present.

### Decoded fields

Decoded fields show engineering values from the selected profile. Fresh values are updated from recent frames. Latched values are retained until replaced by a newer frame.

:::warning
Decoded values are only as reliable as the loaded profiles. Confirm profile byte order, scaling, offsets, payload common fields, and CAN ID layouts before using a value for analysis.
:::

## Behavior: Monitor sorting

Click a column header to sort the visible trace rows. The first click sorts ascending, the second click sorts descending, and the third click removes the manual sort.

When a column sort is active:

- A small arrow appears in the header.
- Loaded logs sort the full file contents.
- Live capture continues to append incoming frames according to the active sort order.

## Reference: Monitor columns

| Column | Content | Notes |
| --- | --- | --- |
| Line | Sequential line number | Invariant across sorting and array shifts |
| Time | Timestamp | Seconds from start or absolute timestamp |
| Interface | \`can0\`, \`vcan0\`, etc. | Source channel |
| Direction | \`RX\`, \`TX:pending\`, \`TX:sent\`, \`TX:failed\` | Message direction and transmit state |
| CAN ID | Hex identifier | 11-bit or 29-bit CAN ID |
| DLC | Data length code | 0 to 64 bytes |
| Flags | \`FD\`, \`BRS\`, \`ESI\` | CAN-FD frame properties |
| Name | Decoded message name | From profile identification rules |
| Decoded / Payload | Decoded values or raw hex | Summarized decoded signals or raw payload |

## Behavior: Trace ordering and retention

Keep the newest rows in the trace table and discard older rows automatically. Latest live frames stay at the bottom unless a manual sort column is selected.

Specify a retention limit between 50 and 100,000 rows in Settings. The default limit is 20,000 rows.

## Behavior: Loaded trace pagination

When viewing large offline logs, pagination controls appear below the table allowing you to navigate across pages cleanly without slowing down rendering.

## Shortcuts: Monitor keyboard navigation

- Up and Down Arrow move selection by one row.
- Page Up and Page Down move by a larger step.
- Home moves to the first visible row.
- End moves to the last visible row.
- Enter toggles the decoded preview panel.

# 3. Profile Editor & Signal Definitions

The Profile Editor describes how raw CAN or CAN-FD frames become meaningful decoded values. A profile is a JSON contract: it defines the bus, identifier layout, optional payload common fields, dictionaries, message identification rules, payload fields, error rules, and display hints.

The editor works from one canonical profile shape. JSON view shows the same canonical JSON that the runtime decodes. Older or external source formats should be converted before importing them into the app.

## Reference: Canonical profile sections

| Section | Purpose |
| --- | --- |
| \`meta\` | Profile id, name, version, description, and source |
| \`bus\` | CAN or CAN-FD, identifier format, and byte order |
| \`canId\` | Decoded arbitration ID fields |
| \`payload.common\` | Optional fields shared by every message, decoded once ahead of variant selection |
| \`payload.discriminator\` | Ordered field names whose decoded values pick a \`payload.variants\` entry |
| \`payload.variants\` | One entry per message, keyed by its discriminator values joined with \`:\` |
| \`dictionaries\` | Value maps turning numeric values into labels |
| \`errors\` | Rules mapping frame data to error severity and messages |

:::note
Older files may nest \`canId\` under a \`layouts\` object instead (\`layouts.canId\`) — both shapes load the same way; the app normalizes either into the same internal representation. New files can use either, but \`canId\` as a direct top-level field (shown above) is simpler and is what \`scripts/knossos_xml_to_profile_json.py\` writes.
:::

## Guide: Start from live trace

1. Open CAN Monitor and select an unmapped row.
2. Right click the row and select Create Profile for Message.
3. The app opens Profile Editor with pre-populated CAN ID, DLC, and sample payload bytes.
4. Add payload signal fields, select dictionaries, and save the new profile.

## Reference: Visual editor layout

- Header: Profile name, bus mode, identifier type, and default byte order.
- Message list: Select a message to edit its identification criteria and payload fields.
- Field editor: Add, remove, and reorder signals. Set bit offset, bit length, data type, scaling factor, offset, unit, and dictionary map.
- JSON Preview: Live canonical JSON representing the edited profile.

## Reference: Message identification

A profile decodes the CAN ID fields, then \`payload.common\` fields, then looks up the message these
select: the values of whichever fields \`payload.discriminator\` names (drawn from either \`canId\` or
\`payload.common\`) are joined with \`:\` and looked up directly in \`payload.variants\`. A variant only
needs an \`identifyWhen\` expression on top of that in the rare case where two variants would otherwise
land on the exact same discriminator key.

## Reference: Payload fields

Supported signal types:

- \`uint\`: Unsigned integer (1 to 64 bits)
- \`int\`: Signed integer (two's complement)
- \`float\`: Single-precision IEEE 754 float (32 bits)
- \`double\`: Double-precision IEEE 754 float (64 bits)
- \`string\`: ASCII or UTF-8 string bytes
- \`enum\`: Numeric value mapped through a dictionary map

## Guide: Convert XML to canonical JSON

The Profile Editor includes a converter for legacy XML profile formats. Click Convert XML to JSON, paste the XML source, and inspect the resulting canonical JSON before importing.

## Reference: Minimal canonical profile

\`\`\`json
{
  "schemaVersion": "1.0",
  "meta": { "id": "engine-status-v1", "name": "Engine Status", "version": "1.0.0" },
  "bus": { "type": "can-fd", "idFormat": "extended", "byteOrder": "little" },
  "layouts": {
    "canId": { "bitLength": 29, "fields": [{ "name": "can_id", "startBit": 0, "bitLength": 29, "type": "uint" }] }
  },
  "payload": {
    "discriminator": ["can_id"],
    "variants": {
      "404765697": {
        "id": "engine_telemetry",
        "label": "Engine Telemetry",
        "payload": {
          "bitLength": 16,
          "fields": [{ "name": "engine_rpm", "label": "Engine Speed", "startBit": 0, "bitLength": 16, "type": "uint", "factor": 0.25, "unit": "RPM" }]
        }
      }
    }
  }
}
\`\`\`

The variant key (\`404765697\`) is \`0x18203C01\` in decimal — \`payload.discriminator\` names \`can_id\`, so
that's the value \`payload.variants\` is keyed by.

## Reference: Error status decoding

Profiles can include error evaluation rules that examine signal values or raw payload bytes to raise warning or critical alerts when limits are exceeded.

## Reference: Shared definitions (Common profiles)

In large-scale CAN networks, message profiles often share a CAN ID layout, node addresses, error codes, and common status enums. Create a Common Profile containing the shared \`canId\` / \`payload.common\`, \`dictionaries\`, and \`errors\`. A dependent profile points \`canId\`/\`payload.common\` at it explicitly with \`{ "ref_file": "common_profile.json" }\`; dictionaries and errors resolve automatically by key across whatever other profiles are currently loaded, no reference needed. See Chapter 7 for the full workflow, including converting Knossos XML service definitions into this shape.

# 4. CAN Simulator & Transmit Workflows

The Transmit Composer and CAN Simulator allow manual, cyclic, and automated frame transmission onto physical or virtual CAN buses.

## Guide: Transmit Composer

Use Transmit Composer to stage and transmit single or repeated CAN / CAN-FD frames.

1. Open Transmit Composer.
2. Enter target CAN ID (standard or extended).
3. Set DLC and payload hex bytes.
4. Configure CAN-FD and BRS flags.
5. Click Send Frame.

## Guide: Cyclic TX

1. Open Transmit Composer.
2. Enable Cyclic TX.
3. Set transmission period in milliseconds (e.g. \`100 ms\`).
4. Select Send Mode:
   - **Fire-and-forget**: Sends periodically without waiting for responses.
   - **Wait for ACK**: Waits for daemon send acknowledgement before scheduling next frame.
   - **Wait for CAN response**: Waits until live capture receives a matching RX response frame.

## Guide: CAN Simulator & Sequences

CAN Simulator executes multi-step automated transmission sequences with conditional logic, response validation, and logging.

### Step types

- **Send Frame**: Transmits a predefined CAN frame.
- **Wait**: Pauses execution for a specified duration in milliseconds.
- **Wait for CAN Response**: Suspends sequence execution until a matching CAN response frame is captured or timeout expires.

# 5. CAN Bridge Daemon & Remote Connections

The CAN bridge daemon is a separate Linux/WSL service that exposes SocketCAN interfaces to this desktop app over WebSockets. Run it where the physical or virtual CAN interfaces exist.

## Setup: Remote daemon connection

To monitor CAN or CAN-FD traffic from WSL or a remote Linux host:

1. Start \`can_bridge_daemon\` on the target machine.
2. Open Connect in this app.
3. Enter WebSocket host IP, port (default \`9501\`), and interface name (\`can0\`, \`vcan0\`).
4. Click Discover to list active network interfaces.
5. Click Test Connection to confirm the daemon is reachable.
6. Click Save and Connect.

You don't need to set Nominal bitrate or Data bitrate for a remote daemon connection. The daemon's CAN interface already has these speeds configured on its own host. This app only needs the interface name to talk to it — not its timing.

## Reference: Daemon capture filter

This is optional. It tells the daemon which frames to send you, before they even leave the daemon host.

- **CAN ID hex**: only frames with this ID are sent.
- **Mask hex**: which bits of the ID have to match. Use \`1FFFFFFF\` to require every bit to match.

Leave both fields empty to receive every frame the daemon sees.

## Setup: Prepare a virtual CAN interface

\`\`\`bash
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
ip link show vcan0
\`\`\`

For physical CAN hardware:

\`\`\`bash
sudo ip link set can0 up type can bitrate 500000
\`\`\`

## Setup: Run the daemon

Development run:

\`\`\`bash
cargo run -- --tcp-bind 0.0.0.0:9500 --ws-bind 0.0.0.0:9501 --grpc-bind 0.0.0.0:9502
\`\`\`

Production release run:

\`\`\`bash
cargo build --release
RUST_LOG=info ./target/release/can_bridge_daemon --tcp-bind 0.0.0.0:9500 --ws-bind 0.0.0.0:9501 --grpc-bind 0.0.0.0:9502
\`\`\`

## Reference: Transport options

- WebSocket JSON: Default transport used by this app (\`ws://HOST:PORT/ws/text\`).
- WebSocket binary: High-throughput binary stream.
- TCP JSONL: Line-oriented JSON over TCP.
- gRPC: Typed streaming API.

## Reference: Daemon-side raw CAN filtering

Remote profiles can include raw daemon-side filters to reduce network traffic before frames are forwarded over WebSockets:

\`\`\`text
(incoming_can_id & mask) == (filter_can_id & mask)
\`\`\`

Example: Filter for service identifier \`810\` (\`0x32A\`):
\`\`\`text
(frame.id & 0x000003FF) == (0x0000032A & 0x000003FF)
\`\`\`

## Guide: Mobile remote monitoring

RustyCAN can be served as a PWA for remote monitoring on mobile phones or tablets while \`can-bridge-daemon\` runs on the Linux host attached to the CAN bus.

# 6. User Tools, Shortcuts & Help Editing

Use this chapter as a reference for application tools, UI shortcuts, customization, and help editing.

## Guide: Filtering and search

The help search field searches rendered documentation. Matching text is highlighted in the preview, and the active result scrolls smoothly into view.

Search navigation shortcuts:

- **Ctrl+F**: Focus search input.
- **Enter / n / Arrow Down**: Jump to next search match.
- **Shift+Enter / p / Arrow Up**: Jump to previous search match.
- **Escape**: Clear search and exit search mode.

## Shortcuts: Keyboard shortcuts and command panel

Open Help > Keyboard Shortcuts to review and edit application shortcuts.

Default shortcuts:

- **Ctrl+Shift+P**: Open command panel.
- **Ctrl+1**: Open CAN Monitor.
- **Ctrl+2**: Open Profile Editor.
- **Ctrl+3**: Open Terminal Trace.
- **Ctrl+,**: Open Settings.
- **Ctrl+/**: Open Keyboard Shortcuts.
- **F1**: Open Help.

## Reference: About, Appearance & Localization

- **About Screen**: View app version, environment details, and quick links.
- **Appearance Settings**: Toggle Light, Dark, or System mode, color palettes, and UI density.
- **Localization Settings**: Select application language, date/time formatting, and number format options.

## Reference: Callout blocks

Note, tip, warning, and danger callouts appear throughout this manual to flag workflow recommendations and risky operations at a glance.

## Troubleshooting

### Search does not find text
Search runs against the rendered help page. Clear any active display filter elsewhere in the app before searching — it doesn't affect Help, but confirms you're looking at the right context — then try the search again.

# 7. Knossos XML Import & Shared Profiles

Knossos service-definition XML files (\`k2_*.xml\`) describe CAN-FD services in a format that predates this app's canonical profile JSON. \`scripts/knossos_xml_to_profile_json.py\` converts them, and can either bake everything into one profile per XML file or split out the CAN ID layout, payload common fields, and protocol-level dictionaries every service shares into one reusable common file that the rest explicitly reference with \`ref_file\`.

## Setup: Run the conversion script

Convert a single XML file to one self-contained canonical profile (no sharing, everything inline):

\`\`\`bash
python scripts/knossos_xml_to_profile_json.py k2_light_control.xml -o k2_light_control_profile.json
\`\`\`

Convert several XML files at once, writing one profile per file plus a shared common file:

\`\`\`bash
python scripts/knossos_xml_to_profile_json.py k2_light_control.xml k2_focus_control.xml --split-dir ./profiles
\`\`\`

This writes \`profiles/knossos_common.json\` (CAN ID layout, payload common fields, and the protocol-level dictionaries — \`command_class\`, \`broadcast\`, \`start_of_transfer\`, \`end_of_transfer\`, \`message_good\` — no variants) alongside \`profiles/k2_light_control_profile.json\` and \`profiles/k2_focus_control_profile.json\`, one per input XML file, each already pointing at it:

\`\`\`json
"canId": { "ref_file": "knossos_common.json" },
"payload": { "common": { "ref_file": "knossos_common.json" }, "discriminator": [ "command_class", "attribute_address", "feature_index" ], "variants": { "...": "..." } }
\`\`\`

Device-specific dictionaries built from that device's own XML (\`attribute_address\`, \`feature_index\`, \`instance_index\`, \`service_identifier\`, and any \`error_status\` codes) stay in the per-device file — only the truly identical protocol constants move to the common file. Load all the files \`--split-dir\` writes together and they work as-is, no manual editing needed.

## Guide: How \`ref_file\` resolves automatically

Load more than one profile JSON at once — Load Profile JSON accepts multiple files in one dialog — and the Profile Editor resolves references at view time:

- **\`canId\` / \`payload.common\`**: when either is written as \`{ "ref_file": "some_file.json" }\`, the Profile Editor looks through every other currently-loaded profile for one whose own source filename matches (case-insensitive, ignoring its folder) and uses that profile's layout instead.
- **Dictionaries**: independently of \`ref_file\`, any dictionary key missing from the active profile is filled in from the first other loaded profile that defines it — this is how device-specific files still pick up the common file's \`command_class\`/\`broadcast\`/etc. without referencing it explicitly.
- **Errors**: same idea, merged by error rule id.

This resolution happens purely from what's currently loaded — nothing is written back to disk, and nothing is recorded beyond the \`ref_file\` string itself. Unload the referenced file, or never load it in the first place, and the reference simply can't resolve.

:::warning
An unresolved \`ref_file\` is never silent — a toast error and a diagnostics log entry appear the moment such a profile becomes active ("*profile* references *file*, but that file isn't currently loaded"), and the CAN ID layout / Payload common tab shows the same message inline instead of a blank layout. If you see this, load the referenced file too, or check you didn't misspell its name.
:::

The CAN ID layout and Payload common tabs show a "Referenced from *file* (loaded as *profile*)" banner with a "Switch to *profile*" button whenever \`ref_file\` resolves successfully — use it to jump straight to the file that actually owns the data, instead of hunting for it in the profile selector.

## Reference: Writing a common (shared) profile file

A common profile is a regular canonical profile JSON with an empty \`payload.variants\` object — it exists purely to be loaded alongside other profiles, not to describe any message on its own:

\`\`\`json
{
  "schemaVersion": "1.0",
  "meta": { "id": "k2_common", "name": "K2 Common CAN Layout", "version": "1.0.0" },
  "bus": { "type": "can-fd", "idFormat": "extended", "byteOrder": "little" },
  "canId": { "label": "Universal CAN ID Layout", "bitLength": 29, "fields": [ "... shared fields ..." ] },
  "payload": {
    "common": { "label": "Payload common", "bitLength": 16, "fields": [ "... shared fields ..." ] },
    "discriminator": [],
    "variants": {}
  },
  "dictionaries": {
    "command_class": { "6": "command/request", "5": "response", "3": "event/notification" }
  },
  "errors": [],
  "display": {}
}
\`\`\`

Keep in mind:

- \`meta.id\` must be unique across every profile you load together — it's the key used to avoid merging a profile with itself.
- Only put dictionaries here that are genuinely identical across every dependent profile. A dictionary that differs per device — like a \`service_identifier\` map naming that one device, or \`attribute_address\`/\`feature_index\` built from that device's own XML — belongs in the device's own file instead; dictionary keys still merge fine across files as long as each device contributes different numeric keys.
- Give the common profile its own real \`meta.name\` — it shows up in the profile selector and in the "Referenced from ..." banner, so name it for what it is ("K2 Common CAN Layout"), not after whichever device you copied it from.
- The filename you save this as is what every dependent profile's \`ref_file\` must match exactly (case-insensitive) — rename it and every reference to it breaks until you update them too.

## Reference: Writing a dependent (message-only) profile file

A dependent profile keeps its own \`payload.discriminator\`/\`payload.variants\`, and points \`ref_file\` at the common file for the layouts it doesn't define itself:

\`\`\`json
{
  "canId": { "ref_file": "k2_common.json" },
  "payload": {
    "common": { "ref_file": "k2_common.json" },
    "discriminator": ["command_class", "attribute_address", "feature_index"],
    "variants": {
      "6:0:1": { "id": "k2_light_control.light_switch.get_current_value.command", "label": "light_switch.get_current_value.command", "payload": { "bitLength": 16, "fields": [] } }
    }
  }
}
\`\`\`

The variant key (\`6:0:1\`) is the \`discriminator\` field values — \`command_class\`, \`attribute_address\`, \`feature_index\` — joined with \`:\`, in that order. \`service_identifier\` doesn't need to be part of the discriminator here: it's constant across every message in one k2 device file, so the right profile is already selected (by trying each loaded profile) before variants are even consulted.

Keep in mind:

- \`ref_file\` can be written on its own with no \`fields\`/\`bitLength\` at all, as shown above — the app fills those in as empty defaults automatically when it loads the file. You never need to write \`"fields": []\` yourself.
- Keep only device-specific dictionary entries locally, such as a single-entry \`service_identifier\` map naming this device. Duplicate copies of shared dictionaries in a dependent file aren't invalid, but they defeat the point of splitting the file out.
- To convert an existing profile that already owns its layout into one that references a shared file instead, open its CAN ID layout tab and use "Reference a shared CAN ID layout file instead" — it prompts for the filename to reference, then clears this profile's own fields after you confirm.
- \`ref_file\` only resolves against profiles that are actually loaded in the app right now — it isn't a filesystem path the app goes and reads on its own. Whatever file you name has to be opened via Load Profile JSON too, in the same session.
- If two variants would land on the exact same discriminator key (equality alone can't tell them apart), register an array of variants at that key instead of one object, giving each an \`identifyWhen\` expression (e.g. \`"mode < 10"\`) — the first one whose expression passes wins.
`;