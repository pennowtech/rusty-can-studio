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

## New user examples

Use these short examples as a first training path. They build from offline inspection to live capture, decoding, transmit, and simulator workflows.

### Example 1: inspect a candump log

1. Open CAN Monitor.
2. Select Open candump.
3. Choose a \`.log\`, \`.txt\`, or \`.candump\` file.
4. Select a row and inspect Decoded Preview.
5. Try a display filter such as \`canId == 0x18203C01\` or \`payload contains "01 01"\`.

:::note
Loaded logs keep the original file order and source line numbers. Display filters hide rows visually but do not renumber the source log.
:::

### Example 2: load profiles and decode frames

1. Open Profile Editor.
2. Load the canonical profile JSON files for the messages you want to decode.
3. Return to CAN Monitor.
4. Select a frame and confirm that Decoded Preview shows CAN ID fields, payload header fields, message name, payload values, and error status.

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

## End-user guide

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

The CAN Monitor display filter is placed directly above the captured or loaded log table. It works across static columns, decoded CAN ID fields, decoded payload header fields, payload values, TX status fields, and raw payload text. It accepts simple Wireshark-style conditions and validates the expression while you type.

The filter box changes color:

- Neutral: no filter is active.
- Green: the filter syntax is valid.
- Red: the filter syntax is invalid, and the message below the box explains where parsing failed.

Filtering is deferred while typing so the input stays responsive on large traces. The table is virtualized, so only visible rows are rendered even when the trace contains many frames.

## Filter examples

| Expression | Meaning |
| --- | --- |
| \`canId == 0x18203C01\` | Match exact 29-bit CAN ID |
| \`id == 0x123\` | Match standard 11-bit CAN ID |
| \`iface == vcan0\` | Match frames received on interface \`vcan0\` |
| \`dir == RX\` | Match received frames |
| \`dir == TX\` | Match transmitted frames |
| \`payload contains "01 01"\` | Match hex sequence anywhere in payload |
| \`name contains "control"\` | Match decoded message title |
| \`service_identifier == k2_focus_control\` | Match exact string enum signal |
| \`instance_index == FIELD\` | Match string enum prefix |
| \`txStatus == failed\` | Match failed transmissions |

## Candump log import

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

## CAN-FD basics

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
Decoded values are only as reliable as the loaded profiles. Confirm profile byte order, scaling, offsets, payload header fields, and CAN ID layouts before using a value for analysis.
:::

## Monitor sorting

Click a column header to sort the visible trace rows. The first click sorts ascending, the second click sorts descending, and the third click removes the manual sort.

When a column sort is active:

- A small arrow appears in the header.
- Loaded logs sort the full file contents.
- Live capture continues to append incoming frames according to the active sort order.

## Monitor columns

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

## Trace ordering and retention

Keep the newest rows in the trace table and discard older rows automatically. Latest live frames stay at the bottom unless a manual sort column is selected.

Specify a retention limit between 50 and 100,000 rows in Settings. The default limit is 20,000 rows.

## Loaded trace pagination

When viewing large offline logs, pagination controls appear below the table allowing you to navigate across pages cleanly without slowing down rendering.

## Monitor keyboard navigation

- Up and Down Arrow move selection by one row.
- Page Up and Page Down move by a larger step.
- Home moves to the first visible row.
- End moves to the last visible row.
- Enter toggles the decoded preview panel.

# 3. Profile Editor & Signal Definitions

The Profile Editor describes how raw CAN or CAN-FD frames become meaningful decoded values. A profile is a JSON contract: it defines the bus, identifier layout, optional payload header, dictionaries, message identification rules, payload fields, error rules, and display hints.

The editor works from one canonical profile shape. JSON view shows the same canonical JSON that the runtime decodes. Older or external source formats should be converted before importing them into the app.

## Canonical profile sections

| Section | Purpose |
| --- | --- |
| \`meta\` | Profile id, name, version, description, and source |
| \`bus\` | CAN or CAN-FD, identifier format, and byte order |
| \`layouts.canId\` | Decoded arbitration ID fields |
| \`layouts.payloadHeader\` | Optional header fields preceding payload data |
| \`dictionaries\` | Value maps turning numeric values into labels |
| \`messages\` | Message identification rules and payload fields |
| \`errors\` | Rules mapping frame data to error severity and messages |

## Start from live trace

1. Open CAN Monitor and select an unmapped row.
2. Right click the row and select Create Profile for Message.
3. The app opens Profile Editor with pre-populated CAN ID, DLC, and sample payload bytes.
4. Add payload signal fields, select dictionaries, and save the new profile.

## Visual editor layout

- Header: Profile name, bus mode, identifier type, and default byte order.
- Message list: Select a message to edit its identification criteria and payload fields.
- Field editor: Add, remove, and reorder signals. Set bit offset, bit length, data type, scaling factor, offset, unit, and dictionary map.
- JSON Preview: Live canonical JSON representing the edited profile.

## Message identification

A profile matches a frame when all defined identification criteria pass:

- CAN ID matches exact value or mask.
- Payload header fields match required constants.
- Payload length meets minimum DLC.

## Payload fields

Supported signal types:

- \`uint\`: Unsigned integer (1 to 64 bits)
- \`int\`: Signed integer (two's complement)
- \`float\`: Single-precision IEEE 754 float (32 bits)
- \`double\`: Double-precision IEEE 754 float (64 bits)
- \`string\`: ASCII or UTF-8 string bytes
- \`enum\`: Numeric value mapped through a dictionary map

## Convert XML to canonical JSON

The Profile Editor includes a converter for legacy XML profile formats. Click Convert XML to JSON, paste the XML source, and inspect the resulting canonical JSON before importing.

## Minimal canonical profile

\`\`\`json
{
  "meta": {
    "id": "engine-status-v1",
    "name": "Engine Status",
    "version": "1.0.0"
  },
  "bus": {
    "type": "can_fd",
    "idType": "extended",
    "byteOrder": "little_endian"
  },
  "messages": [
    {
      "id": "engine_telemetry",
      "name": "Engine Telemetry",
      "canId": "0x18203C01",
      "fields": [
        {
          "id": "engine_rpm",
          "name": "Engine Speed",
          "type": "uint",
          "bitOffset": 0,
          "bitLength": 16,
          "scale": 0.25,
          "unit": "RPM"
        }
      ]
    }
  ]
}
\`\`\`

## Error status decoding

Profiles can include error evaluation rules that examine signal values or raw payload bytes to raise warning or critical alerts when limits are exceeded.

## Shared definitions (Common profiles)

In large-scale CAN networks, message profiles often share node addresses, error codes, and common status enums. Create a Common Profile containing shared \`dictionaries\` and \`errors\`. Any active profile referencing a missing dictionary will dynamically resolve it across loaded common profiles.

# 4. CAN Simulator & Transmit Workflows

The Transmit Composer and CAN Simulator allow manual, cyclic, and automated frame transmission onto physical or virtual CAN buses.

## Transmit Composer

Use Transmit Composer to stage and transmit single or repeated CAN / CAN-FD frames.

1. Open Transmit Composer.
2. Enter target CAN ID (standard or extended).
3. Set DLC and payload hex bytes.
4. Configure CAN-FD and BRS flags.
5. Click Send Frame.

## Cyclic TX

1. Open Transmit Composer.
2. Enable Cyclic TX.
3. Set transmission period in milliseconds (e.g. \`100 ms\`).
4. Select Send Mode:
   - **Fire-and-forget**: Sends periodically without waiting for responses.
   - **Wait for ACK**: Waits for daemon send acknowledgement before scheduling next frame.
   - **Wait for CAN response**: Waits until live capture receives a matching RX response frame.

## CAN Simulator & Sequences

CAN Simulator executes multi-step automated transmission sequences with conditional logic, response validation, and logging.

### Step types

- **Send Frame**: Transmits a predefined CAN frame.
- **Wait**: Pauses execution for a specified duration in milliseconds.
- **Wait for CAN Response**: Suspends sequence execution until a matching CAN response frame is captured or timeout expires.

# 5. CAN Bridge Daemon & Remote Connections

The CAN bridge daemon is a separate Linux/WSL service that exposes SocketCAN interfaces to this desktop app over WebSockets. Run it where the physical or virtual CAN interfaces exist.

## Remote daemon connection

To monitor CAN or CAN-FD traffic from WSL or a remote Linux host:

1. Start \`can_bridge_daemon\` on the target machine.
2. Open Connect in this app.
3. Enter WebSocket host IP, port (default \`9501\`), and interface name (\`can0\`, \`vcan0\`).
4. Click Discover to list active network interfaces.
5. Click Save and Connect.

## Prepare a virtual CAN interface

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

## Run the daemon

Development run:

\`\`\`bash
cargo run -- --tcp-bind 0.0.0.0:9500 --ws-bind 0.0.0.0:9501 --grpc-bind 0.0.0.0:9502
\`\`\`

Production release run:

\`\`\`bash
cargo build --release
RUST_LOG=info ./target/release/can_bridge_daemon --tcp-bind 0.0.0.0:9500 --ws-bind 0.0.0.0:9501 --grpc-bind 0.0.0.0:9502
\`\`\`

## Transport options

- WebSocket JSON: Default transport used by this app (\`ws://HOST:PORT/ws/text\`).
- WebSocket binary: High-throughput binary stream.
- TCP JSONL: Line-oriented JSON over TCP.
- gRPC: Typed streaming API.

## Daemon-side raw CAN filtering

Remote profiles can include raw daemon-side filters to reduce network traffic before frames are forwarded over WebSockets:

\`\`\`text
(incoming_can_id & mask) == (filter_can_id & mask)
\`\`\`

Example: Filter for service identifier \`810\` (\`0x32A\`):
\`\`\`text
(frame.id & 0x000003FF) == (0x0000032A & 0x000003FF)
\`\`\`

## Mobile remote monitoring

Rusty CAN Studio can be served as a PWA for remote monitoring on mobile phones or tablets while \`can-bridge-daemon\` runs on the Linux host attached to the CAN bus.

# 6. User Tools, Shortcuts & Help Editing

Use this chapter as a reference for application tools, UI shortcuts, customization, and help editing.

## Filtering and search

The help search field searches rendered documentation. Matching text is highlighted in the preview, and the active result scrolls smoothly into view.

Search navigation shortcuts:

- **Ctrl+F**: Focus search input.
- **Enter / n / Arrow Down**: Jump to next search match.
- **Shift+Enter / p / Arrow Up**: Jump to previous search match.
- **Escape**: Clear search and exit search mode.

## Keyboard shortcuts and command panel

Open Help > Keyboard Shortcuts to review and edit application shortcuts.

Default shortcuts:

- **Ctrl+Shift+P**: Open command panel.
- **Ctrl+1**: Open CAN Monitor.
- **Ctrl+2**: Open Profile Editor.
- **Ctrl+3**: Open Terminal Trace.
- **Ctrl+,**: Open Settings.
- **Ctrl+/**: Open Keyboard Shortcuts.
- **F1**: Open Help.

## About, Appearance & Localization

- **About Screen**: View app version, environment details, and quick links.
- **Appearance Settings**: Toggle Light, Dark, or System mode, color palettes, and UI density.
- **Localization Settings**: Select application language, date/time formatting, and number format options.

## Editing help content

Open the Edit tab in the Help view to customize markdown documentation. The View tab renders final formatted output, and the Diff tab compares custom changes against the default manual.

Use these callout directive blocks:

\`\`\`markdown
:::note
Neutral information block.
:::

:::tip
Workflow recommendation.
:::

:::warning
Warning for risky operations.
:::

:::danger
Safety-critical warning.
:::
\`\`\`

## Saving and resetting

- **Save**: Persists custom help changes locally.
- **Reset Chapter**: Restores default markdown for the selected chapter.
- **Reset All**: Restores the entire factory default help manual.

## Troubleshooting

### Search does not find text
Ensure you are in the View tab. Search operates on rendered HTML output.

### ToC does not show an entry
Only headings are included in the Table of Contents. Use \`#\`, \`##\`, or \`###\` heading tags.
`;