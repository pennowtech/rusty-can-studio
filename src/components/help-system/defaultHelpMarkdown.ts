export const defaultHelpMarkdown = `# CAN-FD Workbench Help

This help system explains how to use the CAN-FD workbench, how the documentation is structured, and how to edit this content safely.

:::note
CAN-FD supports payloads up to 64 bytes and can use separate nominal and data phase bitrates. The UI keeps those settings visible because they affect decoding, filtering, and transmission.
:::

## Getting started

Use the left navigation to switch between the monitor, simulator, profile editor, settings, and help views.

1. Open the CAN-FD monitor.
2. Select the active interface or connection profile.
3. Start capture.
4. Use filters to reduce the live trace to the frames you need.
5. Inspect decoded signals and payload bytes.

:::tip
Start with a narrow CAN ID filter when the bus is busy. It keeps the trace readable and makes search results more useful.
:::

## New user tutorials

Use these short exercises as a first training path. They build from offline inspection to live capture, decoding, transmit, and simulator workflows.

### Tutorial 1: inspect a candump log

1. Open CAN Monitor.
2. Select Open candump.
3. Choose a \`.log\`, \`.txt\`, or \`.candump\` file.
4. Select a row and inspect Decoded Preview.
5. Try a display filter such as \`canId == 0x18203C01\` or \`payload contains "01 01"\`.

:::note
Loaded logs keep the original file order and source line numbers. Display filters hide rows visually but do not renumber the source log.
:::

### Tutorial 2: load profiles and decode frames

1. Open Profile Editor.
2. Load the profile JSON files for the messages you want to decode.
3. Load a shared CAN ID layout profile if your service profiles reference one.
4. Return to CAN Monitor.
5. Select a frame and confirm that Decoded Preview shows CAN ID fields, payload header fields, message name, payload values, and error status.

:::warning
If a frame belongs to a service or message that is not covered by a loaded profile, it should not borrow names or value maps from unrelated profiles. Load the correct profile or inspect the raw values.
:::

### Tutorial 3: connect to the remote daemon

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

### Tutorial 4: send one frame

1. Connect to a remote daemon.
2. Open the transmit composer.
3. Enter CAN ID, DLC, payload, CAN-FD, and BRS settings.
4. Select Send Frame.
5. Watch CAN Monitor for \`TX:pending\`, \`TX:sent\`, or \`TX:failed\`.

:::note
\`TX:sent\` means the daemon accepted the send call for the selected interface. It does not mean the target device sent an application-level response.
:::

### Tutorial 5: build a cyclic request

1. Load or capture a known request frame.
2. Right click the row and choose Use in Transmit Composer.
3. Open Cyclic TX settings.
4. Set the period, for example \`500 ms\`.
5. Set Send mode to Wait for CAN response.
6. Choose an expected response from loaded profiles.
7. Start cyclic TX and inspect matching RX rows.

### Tutorial 6: create a simulator sequence

1. Open CAN Simulator.
2. Add a sequence.
3. Add Send Once, Wait For Response, and Send Cyclic steps.
4. Define the success condition, response timeout, and stop policy.
5. Run the sequence and inspect the run log.

Example flow:

\`\`\`text
1. Send start command once.
2. Wait for start response with message_good == 1.
3. Send status request cyclically every 100 ms.
4. Stop when the expected status response arrives.
\`\`\`

:::tip
Keep the transmit composer for quick manual sends. Use CAN Simulator when a workflow needs multiple dependent steps.
:::

### Tutorial 7: save work for later

1. Export raw candump logs for replayable evidence.
2. Export decoded CSV for spreadsheet analysis.
3. Save display filter and sort presets for repeated investigations.
4. Export settings when moving the same setup to another installation.

:::warning
Review exported traces, settings, diagnostics, and profile JSON before sharing. They can contain host names, CAN identifiers, decoded names, and timing data.
:::

## Remote daemon connection

To monitor CAN or CAN-FD traffic from WSL, run can-bridge-daemon in the WSL environment where the SocketCAN interfaces exist. The daemon forwards packets from interfaces such as \`vcan0\` or \`can0\` to this UI over WebSocket JSON.

Run the daemon from the \`can_bridge_daemon\` project in WSL:

\`\`\`bash
cargo run -- \
  --tcp-bind 0.0.0.0:9500 \
  --ws-bind 0.0.0.0:9501 \
  --grpc-bind 0.0.0.0:9502
\`\`\`

Then connect from this app:

1. Open CAN Monitor.
2. Click Connect.
3. Create or select a Remote Daemon profile.
4. Use host \`127.0.0.1\`, port \`9501\`, protocol \`WebSocket JSON\`, and interface \`vcan0\` or \`can0\`.
5. Click Save and Connect.
6. Watch Live frame trace for packets forwarded by the daemon.

:::note
The app uses the WebSocket JSON endpoint at \`ws://HOST:PORT/ws/text\`. With the default settings above, that resolves to \`ws://127.0.0.1:9501/ws/text\`.
:::

:::warning
The selected interface must already exist and be up inside WSL. For development, create \`vcan0\` before connecting.
:::

Example WSL virtual CAN setup:

\`\`\`bash
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
ip link show vcan0
\`\`\`

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

### Decoded signals

Decoded signals show engineering values from the selected profile. Fresh values are updated from recent frames. Latched values are retained until replaced by a newer frame.

:::warning
Decoded values are only as reliable as the loaded profiles. Confirm profile byte order, scaling, offsets, payload header fields, and CAN ID layouts before using a value for analysis.
:::

## Profile editor

The Profile Editor describes how raw CAN or CAN-FD frames should be decoded. A profile is the contract between the live trace and meaningful engineering values.

Use it when you know the message structure and want the monitor to decode payload fields instead of showing only raw bytes. For schema profiles, the source JSON is the compact format with \`service\`, \`payloadHeader\`, \`attributes\`, and \`errorStatus\`.

### Start from live trace

1. Open CAN Monitor.
2. Capture traffic from the daemon.
3. Right click a frame in Live frame trace.
4. Choose Define Message Structure.
5. The app opens Profile Editor and selects the closest profile entry for that CAN ID.
6. Define or adjust fields in the matching attribute, operation, and variant.
7. Check Decoded preview against the selected payload.
8. Apply the edit when the layout is correct.

:::tip
Use a real frame from the trace as the preview source. It makes field boundaries, scaling, and profile byte order mistakes visible immediately.
:::

### Editor layout

The visual editor is split into three work areas:

| Area | Purpose |
| --- | --- |
| Profile outline | Navigate CAN ID layout, service, payload header, attributes, operations, and variants from the compact JSON |
| Definition editor | Edit the selected compact JSON concept directly |
| Decoded preview | Decode the selected raw payload using the current field definitions |

Use the profile selector in the toolbar to switch which JSON profile is open for editing. Loading another profile appends it to the profile library and does not replace the current editing context. CAN Monitor decodes against all loaded profiles and uses the first schema that matches each frame.

Double click a decoded message or decoded payload field in CAN Monitor's Decoded Preview to jump directly to the matching profile entry in Profile Editor.

The bit grid displays the selected payload bit value inside each block. If no payload is selected, every bit block displays zero. The byte.bit location is shown below each block; for example, \`2.3\` means byte 2, bit 3. Numeric values are decoded from the selected payload using the profile byte order plus each field's start bit, bit length, factor, and offset.

:::note
JSON view preserves the compact profile structure. The app reads that source structure directly and derives the temporary decode model in memory.
:::

### Definition editor

For compact schema profiles, the Definition editor renders from the JSON shape and edits the source profile fields directly:

- Service name and service identifier come from \`service\`.
- Attribute name and address come from \`attributes[]\`.
- Operation type and feature index come from \`operations[]\`.
- Variant is derived from the selected \`variants.command\`, \`variants.response\`, or \`variants.event\` entry.
- Payload fields are edited inside the selected variant.

The Profile outline mirrors the compact JSON structure. The decoder computes matching from the compact JSON: service identifier, attribute address, feature index, and variant direction.

### What to define

For each field, define:

- Name: stable field identifier, for example \`speed_rpm\` or \`message_good\`.
- Start bit: first bit in the payload.
- Bit length: number of bits used by the field.
- Signedness: unsigned or signed.
- Factor: multiplier applied to the raw value.
- Offset: value added after scaling.
- Unit: optional display unit.

Set byte order once at the top of the Field layout panel. It applies to all generic fields in the profile.

:::warning
Do not guess semantic field names from raw payload bytes alone. Use a specification, generated code, XML schema, JSON schema, or protocol document as the source of truth.
:::

### Recommended JSON profile approach

For generic decoding, prefer the compact JSON profile format over importing XML directly into the monitor. XML can still be supported through a converter, but the runtime decoder should consume profile JSON rather than XML.

Recommended workflow:

1. Convert external formats such as Knossos XML, DBC, ARXML, or generated code metadata into compact app profile JSON.
2. Keep the live decoder independent from the original source format.
3. Validate the JSON profile before using it for live capture.
4. Store schema version and source metadata in the profile.

:::note
This keeps the app generic. The monitor should not need to know whether a compact profile originally came from XML, DBC, hand-authored JSON, or generated code.
:::

### Convert Knossos XML to JSON

The repository includes a helper script:

\`\`\`text
scripts/knossos_xml_to_profile_json.py
\`\`\`

Use it to convert one or more Knossos \`k2_*.xml\` files into the compact JSON profile shape used by the app.

\`\`\`bash
python scripts/knossos_xml_to_profile_json.py \
  ../k2_drive.xml ../k2_motion.xml \
  --output knossos-profile.json
\`\`\`

For day-to-day editing, prefer split output:

\`\`\`bash
python scripts/knossos_xml_to_profile_json.py \
  ./k2_light_control.xml ./k2_xy_axis_control.xml \
  --split-dir ./profiles
\`\`\`

This writes one compact \`*_profile.json\` file per XML plus \`knossos_can_id_layout.json\`. Service profiles refer to the reusable CAN ID layout through \`canIdLayoutRef\`. Load the CAN ID layout profile once when the service profiles do not embed their own \`canIdLayouts\`.

Load one or more generated \`*_profile.json\` files in Profile Editor with Load Profile JSON. Use the profile selector to choose which service profile is active for editing. CAN Monitor can decode frames against all loaded profiles, so loading another service profile should add coverage instead of replacing the previous service definitions.

:::note
The service JSON is the source profile. The layout JSON only supplies reusable CAN ID field definitions such as \`command_class\`, \`source_address\`, and \`service_identifier\`.
:::

:::warning
The converter is intentionally conservative. XML schemas differ in naming and nesting, so review the generated JSON before relying on it for live decode.
:::

:::tip
Keep generated profiles under version control next to the XML files. When the XML changes, regenerate the JSON and compare the diff before using it in a test session.
:::

### Suggested JSON schema shape

For protocols like Knossos, a service profile should keep the source schema compact: one service, one shared payload header, and attributes with operations. The app derives runtime match rules from this structure without changing the JSON view.

\`\`\`json
{
  "meta": {
    "name": "Knossos CAN-FD Profile",
    "version": "1.0.0",
    "source": "converted-from-k2-xml"
  },
  "byteOrder": "little",
  "protocol": "schema",
  "canIdLayoutRef": "knossos_can_id",
  "service": {
    "name": "XYAxisControl",
    "identifier": 252
  },
  "payloadHeader": {
    "lengthBytes": 2,
    "fields": [
      { "name": "attribute_address", "byte": 0, "startBit": 1, "length": 7 },
      { "name": "message_good", "byte": 0, "startBit": 0, "length": 1, "type": "bool" },
      {
        "name": "instance_index",
        "byte": 1,
        "startBit": 4,
        "length": 4,
        "values": {
          "1": "Axis 1",
          "2": "Axis 2"
        }
      },
      { "name": "feature_index", "byte": 1, "startBit": 0, "length": 4 }
    ]
  },
  "attributes": [
    {
      "name": "start_reference_drive",
      "address": 96,
      "operations": [
        {
          "type": "execute",
          "featureIndex": 1,
          "variants": {
            "command": [
              { "name": "mode", "byte": 2, "startBit": 0, "length": 8, "type": "uint" }
            ],
            "response": []
          }
        }
      ]
    }
  ],
  "errorStatus": {
    "field": "message_good",
    "goodValue": 1,
    "byteOffset": 2,
    "byteLength": 4,
    "byteOrder": "little",
    "codes": {
      "1": "unknown service",
      "2": "invalid attribute"
    }
  }
}
\`\`\`

The app derives exact match rules from this JSON. \`service.identifier\` maps to the CAN ID \`service_identifier\`, each attribute \`address\` maps to \`attribute_address\`, each operation \`featureIndex\` maps to \`feature_index\`, and variant names map to command class: \`command\` = 6, \`response\` = 5, \`event\` = 3. Decoded Preview and CAN Monitor use the JSON names for display while keeping raw numeric values available for filtering and export.

:::tip
Keep the compact profile as the source format. The loader derives the runtime decode model internally, but users should not need to hand-maintain a long generated message list.
:::

For repeated instances, use a value map on the shared payload header field instead of duplicating every attribute for every instance. For arrays, a field can define \`count\` and \`stride\`; the loader expands that into indexed decoded fields.

### Error status decoding

Use profile-level \`errorStatus\` for protocol error handling. Do not model protocol errors as normal payload expression fields.

\`\`\`json
"errorStatus": {
  "field": "message_good",
  "goodValue": 1,
  "byteOffset": 2,
  "byteLength": 4,
  "byteOrder": "little",
  "codes": {
    "12": "ERROR_AXIS_POSITION_NOT_REACHED"
  }
}
\`\`\`

The decoder reads \`errorStatus.field\` from the decoded payload header. If the value does not match \`goodValue\`, it reads the error code from \`byteOffset\` and \`byteLength\`, then resolves the display text from \`codes\`.

The decoded frame exposes:

- \`message_good\`
- \`errorCode\`
- \`errorText\`
- error row highlighting in CAN Monitor

Use display filters such as:

\`\`\`text
error
hasError == true
errorCode == 12
errorText contains POSITION
message_good == bad
\`\`\`

:::tip
Use expressions for simple value formatting, such as \`raw == 1 ? "On" : "Off"\`. Use \`errorStatus\` for dictionary-based protocol errors because it keeps error handling declarative and profile-driven.
:::

### Knossos decoding expectations

For a Knossos CAN-FD profile, decoding should follow this order:

1. Decode the 29-bit arbitration ID into command class, broadcast flag, source, destination, transfer flags, toggle, and service identifier.
2. Decode payload byte 0 into attribute address and message_good.
3. Decode payload byte 1 into instance index and feature index.
4. Match service identifier against the profile services.
5. Match instance index against the service instances.
6. Match attribute address against methods, events, or properties.
7. Match feature index against execute, get, set, value, or another feature name.
8. Decode bytes after the two-byte header using the selected payload field definition.
9. If message_good is false, decode bytes 2 through 5 as a little-endian uint32 error code unless the profile says otherwise.
10. Map error codes through the profile error dictionary.

:::danger
Unknown service identifiers should not be decoded by guessing. Show the raw CAN ID fields and mark the frame as requiring another schema.
:::

### Timing analysis

Timing analysis should group repeated messages by:

- service_identifier
- instance_index
- attribute_address
- feature_index
- command_class or direction when relevant

For each group, calculate interval statistics such as last interval, minimum interval, maximum interval, average interval, and missed-period warnings.

For reference-drive analysis, useful checks include:

- start_reference_drive requests and responses
- retrigger_reference_drive requests and responses
- movement_aborted events

## CAN Monitor display filters

The CAN Monitor display filter is placed directly above the captured or loaded log table. It works across static columns, decoded CAN ID fields, decoded payload header fields, payload values, TX status fields, and raw payload text. It accepts simple Wireshark-style conditions and validates the expression while you type.

The filter box changes color:

- Neutral: no filter is active.
- Green: the filter syntax is valid.
- Red: the filter syntax is invalid, and the message below the box explains where parsing failed.

Filtering is deferred while typing so the input stays responsive on large traces. The table is virtualized, so only visible rows are rendered even when the trace contains many frames.

:::tip
Use decoded field names directly. If a profile defines \`command_class\`, \`message_good\`, \`service_identifier\`, \`attribute_address\`, or a message-specific payload field such as \`position\`, those names can be used in the display filter.
:::

### Filter examples

\`\`\`text
18203C01
canId == 18203C01
iface == can1
len >= 8
mode == CAN-FD
payload contains "01 01"
command_class == response
message_good == good
service_identifier == 5 and attribute_address == 64
position > 1000
attributeName ~= reference
error
hasError == true
errorCode == 12
errorText contains POSITION_NOT_REACHED
txStatus == failed
txError contains daemon
\`\`\`

Supported operators:

| Operator | Meaning | Example |
| --- | --- | --- |
| \`==\` | Exact text or numeric equality | \`canId == 18203C01\` |
| \`!=\` | Not equal | \`dir != TX\` |
| \`>\`, \`>=\`, \`<\`, \`<=\` | Numeric comparison | \`len >= 12\` |
| \`contains\` | Case-insensitive substring match | \`payload contains AA BB\` |
| \`~=\` | Case-insensitive regular expression | \`attributeName ~= reference\` |

Bare text searches all available row values. Field conditions search one specific value. Conditions can be joined with \`and\` or \`or\`.

Right click a column header to build a filter from that column. The menu can replace the current filter, add the selected row value with \`and\`, add it with \`or\`, or insert an editable condition template. Use the \`X\` button in the filter field to clear the expression quickly.

Error rows are highlighted in red when a matching loaded profile decodes a bad response through its \`errorStatus\` block. Use \`error\` for a quick error-only filter, or use \`hasError == true\`, \`errorCode == 12\`, and \`errorText contains POSITION\` when you need a precise error view.

### Monitor sorting

CAN Monitor supports multi-column sorting after display filtering. Sorting is applied before loaded-log pagination, so every page follows the same ordered result set.

Right click a column header to:

- sort ascending
- sort descending
- add the column as the next ascending sort priority
- add the column as the next descending sort priority
- clear the current sort rules

Active sort rules are shown in the sort strip above the trace summary. Each rule shows its priority, column name, and direction. Use the up and down controls on the rule chip to change priority, click the direction text to toggle ascending or descending, or click \`X\` to remove that one rule.

:::tip
Use sorting for offline analysis, for example sort by \`canId\`, then \`time\`, or sort by \`errorCode\`, then \`attributeName\`. For live capture, original stream order is usually easier to follow.
:::

Sort presets let you save a useful rule set and restore it later. Build the active sort rules, click Save in the sort strip, give the preset a name, and then reload it from the Sort presets dropdown. Delete removes only the selected sort preset, not the trace data.

:::note
Sorting does not modify the loaded candump file or captured frame buffer. It only changes table presentation and CSV export order.
:::

### Monitor columns

When schema profiles are loaded, CAN Monitor keeps the table stable by showing:

- default trace columns such as time, interface, CAN ID, direction, length, mode, and payload
- universal CAN ID layout fields
- payload header fields
- one final payload column for message-specific decoded values

Message-specific values such as \`ON_OFF_CYCLES\`, \`TOTAL_ONTIME\`, or private signal names are not added as separate table columns because they vary by message type. They are shown in the payload values column and in the decoded preview. Use the column menu to hide or show default columns, CAN ID fields, and payload header fields.

Drag column headers to reorder the table. Right click cells to copy values, copy a complete CAN message, copy a candump line, stage the frame into the transmit composer, or use the payload as a decode preview.

### Trace ordering and retention

Live capture appends new frames at the bottom and automatically follows the newest packet while capture is active. Loaded candump files are shown in the same order as the file.

Trace retention is configured in Settings. The maximum row count applies to live capture and locally transmitted TX rows, where older rows are discarded once the limit is exceeded. Loaded candump files are not trimmed by this setting so source order and source line numbers remain intact.

:::tip
Use a smaller live trace retention limit when the bus is very busy. It keeps decode, filtering, and row rendering responsive while still showing the newest traffic.
:::

The status bar Frames value is the total captured or loaded frame count. It does not shrink when a display filter is active or when live trace retention removes older rows. Table line numbers keep increasing during live capture, so removed rows do not cause reused sequence numbers.

### Loaded trace pagination

Loaded candump and log files use pagination at the bottom of CAN Monitor. Live capture does not use pagination; it continues to append and follow the newest frame as before.

The pagination footer provides:

- First, Previous, Next, and Last page controls
- row count choices: 10, 25, 50, 100, 250, 500, and 1000
- current page and total page count
- visible row range and total filtered row count

The selected row count and current page are saved with monitor preferences. When a new log is opened, the table starts at page 1. If a display filter reduces the result set and the old page no longer exists, the app automatically moves to the last valid page.

:::warning
Pagination is only for loaded traces. Do not expect live capture to pause at page boundaries; live capture is intentionally stream-oriented.
:::

Use Log to export retained trace rows as standard candump text. Use CSV to export the current decoded table view with the active display filter, active sorting, visible columns, and column order.

:::note
CSV export follows the table as currently configured. Hide columns or apply a display filter before exporting when you only need a focused subset.
:::

### Monitor keyboard navigation

When focus is on CAN Monitor and not inside an input field, the table supports keyboard navigation:

- Arrow Up and Arrow Down move the selected row.
- Page Up and Page Down move by a larger step.
- Home moves to the first visible row.
- End moves to the last visible row.
- Enter toggles the decoded preview panel.

For loaded traces, keyboard navigation follows the current page. For live capture, it follows the current filtered and sorted stream.

## Terminal Trace

Terminal Trace is a candump-style text view for the same frame buffer used by CAN Monitor. Open it from the sidebar, the View menu, or the command panel.

Use it when you want a fast, plain text view of live traffic or a loaded log:

- each line is formatted like candump output
- live capture follows the newest frame when Follow is enabled
- loaded candump files are shown in source order
- the line limit can show the newest 250, 500, 1000, 5000, or all frames
- Wrap controls whether long payload lines stay horizontal or wrap inside the panel
- Copy places the visible terminal text on the clipboard
- Save writes the visible terminal text as a candump log file

:::note
Terminal Trace is a presentation view. It does not replace CAN Monitor filtering, decoded preview, sorting, or pagination. Use CAN Monitor for structured analysis and Terminal Trace when plain candump-style text is easier to inspect or copy.
:::

:::tip
For very busy live buses, keep the terminal line limit at 1000 or below and leave Follow enabled. This keeps the text stream responsive while still showing the newest traffic.
:::

## Mobile remote monitoring

Rusty CAN Studio can be installed as a browser-based mobile web app from the PWA build. This is intended for remote monitoring on a phone or tablet while the CAN bridge daemon runs on the Linux or WSL host where the CAN interfaces exist.

Recommended mobile workflow:

1. Start can-bridge-daemon on the machine attached to the CAN bus.
2. Serve the web build on a network address reachable from the mobile device.
3. Open the app in the mobile browser.
4. Use the browser option to add the app to the home screen.
5. Open Connect and create a Remote Daemon profile pointing to the daemon host and WebSocket port.
6. Use CAN Monitor or Terminal Trace for live traffic.

The mobile layout gives the monitor the full screen width, hides the desktop sidebar, stacks decoded preview and transmit panels below the trace, and keeps the status bar compact. The top menu and command panel remain available for navigation.

:::warning
Mobile browsers can block insecure WebSocket connections depending on network, HTTPS, and browser policy. For reliable field use, serve the app and daemon endpoint with a network setup accepted by the target device.
:::

:::note
The mobile web app is for remote monitoring and light inspection. Profile editing, large loaded log analysis, and complex simulator sequences are still more comfortable on desktop.
:::

Field layout expressions can control how a payload value is displayed. Expressions are intentionally small: arithmetic, comparisons, ternary conditions, and quoted display strings are supported. Statements, loops, imports, global objects, and full JavaScript programs are not allowed.

\`\`\`text
raw * 0.1
raw == 1 ? "On" : "Off"
value + " ms"
\`\`\`

:::note
Filter field names ignore case and punctuation for matching. For example, \`canId\`, \`can_id\`, and \`CAN ID\` resolve to the same column where applicable.
:::

:::warning
Display filtering does not drop frames from capture. It only controls which rows are shown in the table.
:::

## Filtering and search

The help search field searches the rendered documentation. Matching text is highlighted in the preview, and the active result scrolls into view.

Keyboard behavior:

- Ctrl+F or Cmd+F focuses help search.
- Arrow Down moves to the next result while the search field is focused.
- Arrow Up moves to the previous result while the search field is focused.
- F3 moves to the next result.
- Shift+F3 moves to the previous result.
- Escape clears the search field.

## Keyboard shortcuts and command panel

Open Help > Keyboard Shortcuts to review and edit application shortcuts. Click a shortcut field, press the new key combination, and the change is saved immediately for this installation.

Default shortcuts:

- Ctrl+Shift+P: open the command panel.
- Ctrl+1: open CAN Monitor.
- Ctrl+2: open Profile Editor.
- Ctrl+3: open Terminal Trace.
- Ctrl+,: open Settings.
- Ctrl+/: open Keyboard Shortcuts.
- F1: open Help.

The command panel shows the same saved shortcuts beside each command and can also open the shortcut editor. Duplicate shortcuts are highlighted in the shortcut editor so they can be resolved before use.

:::tip
Use the command panel when you do not remember a shortcut. Search by action name, view name, connection workflow, theme, or help topic.
:::

## About screen

Open Help > About to view application information, current appearance settings, and quick links back to the monitor and help system.

## Appearance settings

Open Settings to change how the whole application looks and feels. Appearance changes apply immediately and are saved for the next session.

## Localization settings

Open Settings > Localization to choose the application locale. The current implementation provides a localization foundation for selected app chrome and settings surfaces, plus locale-aware formatting.

Available locale choices:

- English
- Deutsch
- Francais
- Arabic

Changing the locale updates:

- selected navigation and menu labels
- selected Settings labels
- date and time formatting
- number formatting
- document language
- document direction for right-to-left locales

:::note
Profile names, decoded field names, CAN payload values, daemon messages, and imported JSON content are shown exactly as provided by profiles, traces, and the daemon. They are protocol data, not translated UI strings.
:::

:::tip
Use the preview cards in Localization to verify number and date formatting immediately after changing language.
:::

Available mode options:

- System: follow the operating system light or dark preference.
- Light: force light mode.
- Dark: force dark mode.

Available color themes:

- Default: balanced general-purpose theme.
- Graphite: neutral engineering UI with low visual noise.
- Zeiss Blue: professional blue accent palette.
- High Contrast: stronger borders and contrast for readability.
- Terminal Trace: dark/log-focused palette for long trace sessions.
- Warm Neutral: softer palette for long sessions.

Available density options:

- Comfortable: default spacing.
- Compact: reduced spacing for more rows and controls on screen.
- Dense: maximum information density for trace-heavy workflows.

Density affects table row height, button and input height, panel padding, gaps, and font scale. The difference is most visible in CAN Monitor and Profile Editor tables.

The Settings preview shows typical monitor states such as RX, TX sent, TX failed, decoded values, buttons, and status badges so you can evaluate a theme before continuing work. A portable implementation reference is available in \`docs/theme-system-spec.md\`.

## Diagnostics log

Open Settings > Diagnostics log to inspect recent application events that are useful for troubleshooting.

The diagnostics log records:

- connection attempts and failures
- remote interface discovery results
- capture pause and resume events
- transmit failures and daemon rejections
- profile import, JSON parse, validation, and export-blocking errors

Each entry has a timestamp, severity, source, message, and optional detail text. The log is saved locally and capped to the newest 500 entries so it stays useful without growing forever.

Use Export diagnostics when you need to share troubleshooting information. Use Clear diagnostics when the old entries are no longer relevant.

:::warning
Diagnostics can include host names, interface names, CAN IDs, profile names, and error text. Review exported diagnostics before sharing them outside your team.
:::

## Historical traces

Open Settings > Historical traces to save and reload retained trace snapshots.

The archive stores the current retained CAN Monitor frame buffer as candump text. Saved traces can be:

- loaded back into CAN Monitor
- exported as candump log files
- deleted individually
- cleared as a group

Use this for short-term investigation workflows, for example saving a failing live capture before reconnecting, preserving a filtered test run, or keeping a known reference trace available for profile work.

:::note
Historical traces are stored locally in browser/Tauri storage and are capped to the newest saved entries. For long-term evidence, export the trace as a candump log and store it in your normal project or test-result location.
:::

## Security checks

The repository includes a repeatable security baseline for dependency and accidental-secret checks.

Run the web dependency audit:

\`\`\`bash
npm run audit
\`\`\`

Run the fuller local helper on Windows:

\`\`\`powershell
npm run security:audit
\`\`\`

The helper runs npm audit, tries cargo audit for Tauri dependencies when available, and scans repository files for common secret patterns. The CI workflow also runs audit, tests, build, and Rust dependency audit on pull requests and pushes to main.

:::warning
Security checks do not sanitize engineering data. Review diagnostics exports, trace archives, candump logs, settings backups, and profile JSON before sharing them.
:::

## Testing and quality checks

Use the automated quality checks before sharing changes or before packaging a build.

Run the fast unit test suite:

\`\`\`bash
npm run test
\`\`\`

Run the fuller local quality check on Windows:

\`\`\`powershell
npm run quality:check
\`\`\`

The full local check runs Vitest unit tests, a production frontend build, accessibility baseline checks, npm dependency audit, and Rust \`cargo check\` for the Tauri crate.

Useful variants:

\`\`\`powershell
npm run quality:check -- -SkipRust
npm run quality:check -- -SkipAudit
\`\`\`

Run the accessibility baseline directly:

\`\`\`powershell
npm run accessibility:check
\`\`\`

The accessibility baseline checks document language, viewport, document title, icon button accessible-name fallback, screen-reader-only text, alert roles, helpful title text, and raw button \`type\` attributes.

:::tip
Use the fast test command while editing logic, then run the full quality check before pushing a larger feature.
:::

:::note
The CI quality workflow runs install, tests, production build, and Rust compile checks on pull requests and pushes to main. The separate security workflow handles dependency vulnerability checks.
:::

:::warning
Automated accessibility checks are a baseline, not a full WCAG audit. For major UI changes, also verify keyboard navigation, visible focus, screen-reader names, contrast in each theme, 200 percent zoom, and compact/dense layouts manually.
:::

### Performance benchmarks

Run benchmarks when changing trace parsing, display filtering, sorting, profile decoding, or any path that may touch thousands of frames:

\`\`\`bash
npm run benchmark
\`\`\`

The benchmark suite covers candump parsing on larger traces and derived-field creation against a profile with many signals. Benchmark results vary by machine, so use them as before-and-after comparisons on the same computer.

## Transmit composer

Use the transmit composer to prepare a single CAN-FD frame or a cyclic transmission.

Example frame:

\`\`\`text
ID:      18DA10F1
DLC:     64
Payload: 02 10 03 00 00 00 00 00
Mode:    CAN-FD with BRS
\`\`\`

Single-frame transmission sends through the active remote daemon connection. The monitor inserts a local TX row immediately:

- \`TX:pending\`: the app sent the request and is waiting for daemon acknowledgement.
- \`TX:sent\`: the daemon accepted the frame for transmission.
- \`TX:failed\`: the daemon, connection, or interface rejected the frame.

TX rows are color coded and can be filtered with \`txStatus\` and \`txError\`. Retry count controls how many additional attempts are made when the daemon or interface reports an error.

### Cyclic TX

Cyclic TX repeatedly sends the current composer frame. Configure:

- Period value and unit: \`ms\` or \`s\`.
- Send mode: fire-and-forget, wait for daemon ACK, or wait for CAN response before scheduling the next frame.
- Expected response: any RX frame on the selected interface, or a response/event message derived from loaded profiles.
- Response timeout: maximum time to wait for the selected response.
- Late ACK/response policy: skip the missed period, send the next frame immediately, or stop cyclic TX.

Fire-and-forget keeps the requested cadence and does not wait for acknowledgement before scheduling the next send. Wait-for-ACK avoids piling up sends when the daemon or bus is slow. Wait-for-CAN-response waits until live capture receives the expected RX frame on the selected interface.

Example workflow for periodically requesting \`on_off_cycles\`:

1. Load a candump file or start live capture with a profile that decodes \`on_off_cycles\`.
2. Find a known \`on_off_cycles.get_current_value.command\` or equivalent request row in CAN Monitor.
3. Right click the row and choose Use in Transmit Composer. This copies CAN ID, payload, DLC, CAN-FD, and BRS settings into the composer.
4. Open Cyclic TX in the transmit composer.
5. Set Period and Unit, for example \`500 ms\`.
6. Set Send mode to Wait for CAN response.
7. In Expected response, select \`on_off_cycles.get_current_value.response\`.
8. Set Response timeout to a value that fits the bus and device timing, for example \`1000 ms\`.
9. Choose the late policy:
   - Skip missed period: keep running, but wait until the next period after a timeout.
   - Send next immediately: keep running and retry immediately after a late response.
   - Stop cyclic TX: stop on the first missing or late response.
10. Start cyclic TX and watch the monitor for \`TX:sent\` rows followed by the decoded response rows.

:::warning
Wait-for-CAN-response depends on subscribed live capture. If the expected response is filtered out by the daemon or the wrong interface is selected, cyclic TX will time out.
:::

## CAN Simulator sequences

Use CAN Simulator when a workflow is larger than one manual transmit or one cyclic frame. The Sequences workspace models a reusable state machine without assuming any specific protocol or organization-specific message format.

A sequence is made of ordered steps:

- Send Once: send one manually defined frame or profile-referenced message.
- Wait For Response: wait until live capture receives a matching RX frame.
- Send Cyclic: repeatedly send a frame until a response, timeout, or stop policy ends the step.
- Delay: wait for a fixed duration.
- Branch: reserve a conditional decision point for simple expression-driven workflows.

Typical start-then-poll workflow:

1. Add a Send Once step for frame A.
2. Add a Wait For Response step for response A.
3. Set the success condition, for example \`message_good == 1\`.
4. Add a Send Cyclic step for frame B.
5. Set the cyclic stop response, for example \`message_b.response\`.
6. Set the cyclic stop condition, for example \`message_good == 1\`.
7. Set period, maximum duration, timeout policy, and late-response behavior.
8. Run the sequence and inspect the run log plus CAN Monitor trace.

Example sequence JSON:

\`\`\`json
{
  "name": "Start then poll until response",
  "steps": [
    {
      "type": "send",
      "name": "Send frame A once",
      "frameRef": "message_a.command",
      "canId": "18203C01",
      "payload": "01 01"
    },
    {
      "type": "wait",
      "name": "Wait for response A",
      "expect": "message_a.response",
      "condition": "message_good == 1",
      "timeoutMs": 1000,
      "onTimeout": "fail"
    },
    {
      "type": "cyclic",
      "name": "Cyclic frame B until response",
      "frameRef": "message_b.command",
      "canId": "14089C01",
      "payload": "01 01 07 00 00 00",
      "periodMs": 100,
      "maxDurationMs": 10000,
      "stopWhen": {
        "expect": "message_b.response",
        "condition": "message_good == 1",
        "matches": 1
      }
    }
  ]
}
\`\`\`

Response matching uses decoded profile data when profiles are loaded. You can match by message name, decoded meaning, service name, attribute name, feature name, CAN ID, or expression fields.

Useful conditions:

\`\`\`text
message == "on_off_cycles.get_current_value.response"
message_good == 1
error_status == null
service_identifier == 810 && attribute_address == 3
\`\`\`

Scenario-related frames are marked in CAN Monitor with \`SEQ:tx\` for transmitted sequence frames and \`SEQ:rx-match\` for received frames that satisfied a wait or cyclic stop condition.

:::tip
Keep the transmit composer for quick manual sends. Use CAN Simulator sequences for multi-step workflows such as wake-up then poll, unlock then stream, request calibration then wait for event, or cyclic keepalive until state changes.
:::

## Connection profiles

Open Connect to create or edit connection profiles. Remote Daemon profiles can be saved without connecting, or saved and connected immediately. When the daemon is reachable, use Discover to load available CAN interfaces into a dropdown.

Local CAN is shown separately from Remote Daemon. Direct Local CAN capture is not wired in this UI yet, so Save and Connect is disabled for Local CAN profiles.

Remote Daemon connections retry automatically when Auto reconnect is enabled. The status bar reports only the connection state: Disconnected, Connecting, Connected, or Failed.

Connection profiles can also store CAN timing metadata:

- CAN-FD enabled or disabled
- nominal bitrate for the arbitration phase
- data bitrate for the CAN-FD payload phase

These values are saved with the profile and shown in the Connection Profiles dialog. They are useful when you keep several remote daemon profiles for different buses or test benches.

:::warning
The bitrate fields document the expected interface timing. The current desktop app and WebSocket JSON daemon path do not reconfigure SocketCAN timing. Bring the interface up with matching \`ip link\` settings on the daemon host before connecting.
:::

### Hardware adapters

The app integrates with common CAN hardware through the Linux SocketCAN interface exposed by the daemon host. Connection profiles can record the adapter family so profiles remain understandable when you switch between virtual CAN, lab hardware, and vehicle adapters.

Supported adapter profile labels include:

- Generic SocketCAN
- Virtual CAN
- PEAK PCAN
- Kvaser
- Vector
- CANable / SLCAN
- Other SocketCAN adapter

This label does not change the wire protocol used by the desktop app. The daemon still subscribes to Linux CAN interfaces such as \`vcan0\`, \`can0\`, or \`can1\`. Vendor drivers, \`slcand\`, candlelight firmware, or other setup tools must expose the adapter as SocketCAN before the app can use it.

:::tip
Use one connection profile per physical bus setup. For example, keep separate profiles for \`vcan0\` simulation, PEAK PCAN at 500000/2000000 bit/s, and CANable/SLCAN at classic 500000 bit/s.
:::

## CAN bridge daemon

The CAN bridge daemon is a separate Linux/WSL service that exposes SocketCAN interfaces to this desktop app. Run it where the CAN interfaces exist. For WSL workflows, the daemon runs inside WSL and the desktop app connects to it from Windows.

### Recommended workflow

1. Start or verify the CAN interface in Linux or WSL.
2. Start the daemon with WebSocket JSON enabled.
3. In this app, create a Remote Daemon connection profile.
4. Use Discover in the connection dialog to list interfaces reported by the daemon.
5. Select the interface, then Save and Connect.
6. Use CAN Monitor for live RX/TX frames and Transmit Composer for manual or cyclic TX.

### Prepare a virtual CAN interface

\`\`\`bash
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
ip link show vcan0
\`\`\`

For physical CAN, bring up the interface with the required bitrate:

\`\`\`bash
sudo ip link set can0 up type can bitrate 500000
\`\`\`

### Run the daemon

Development run:

\`\`\`bash
cargo run -- --tcp-bind 0.0.0.0:9500 --ws-bind 0.0.0.0:9501 --grpc-bind 0.0.0.0:9502
\`\`\`

Run with fake frames when the bus is quiet:

\`\`\`bash
RUST_LOG=info cargo run -- --tcp-bind 0.0.0.0:9500 --ws-bind 0.0.0.0:9501 --grpc-bind 0.0.0.0:9502 --fake
\`\`\`

Use release mode when you need lower overhead:

\`\`\`bash
cargo build --release
RUST_LOG=info ./target/release/can_bridge_daemon --tcp-bind 0.0.0.0:9500 --ws-bind 0.0.0.0:9501 --grpc-bind 0.0.0.0:9502
\`\`\`

### Transport options

- WebSocket JSON: easiest option for this app and browser-like clients.
- WebSocket binary: lower overhead for high-rate streaming clients.
- TCP JSONL: good for shell tooling and line-oriented clients.
- TCP binary: efficient for custom clients.
- gRPC: typed API and streaming for generated clients.

The current app connection flow uses WebSocket JSON.

### Daemon operations used by the app

- \`client_hello\`: starts the session.
- \`list_ifaces\`: returns Linux CAN interfaces such as \`can0\` or \`vcan0\`.
- \`subscribe\`: streams RX/TX frame events for selected interfaces.
- \`unsubscribe\`: pauses live capture for the session.
- \`send_frame\`: sends a CAN or CAN-FD frame through the selected interface.
- \`send_ack\`: reports whether the daemon successfully handed the frame to the selected SocketCAN interface.

### Capture filters

Remote profiles can include a raw daemon-side filter. This reduces traffic before frames are forwarded to the app. Filters are intentionally protocol-agnostic and work on raw CAN properties:

- CAN ID
- CAN ID mask
- interface
- CAN-FD flag
- payload length range

Use profile-specific decoding in the app to decide which raw CAN ID/mask should be used. The daemon should not know service identifiers, source addresses, destination addresses, or any product-specific schema names.

The filter compares this expression:

\`\`\`text
(incoming_can_id & mask) == (filter_can_id & mask)
\`\`\`

For service identifier \`810\`, the concrete comparison is:

\`\`\`text
(frame.id & 0x000003FF) == (0x0000032A & 0x000003FF)
\`\`\`

For profiles that use this 29-bit arbitration layout:

\`\`\`text
[29:26] command_class
[25]    broadcast
[24:19] destination_address
[18:13] source_address
[12]    start_of_transfer
[11]    end_of_transfer
[10]    toggle
[9:0]   service_identifier
\`\`\`

Examples:

| Goal | CAN ID value | Mask | Why |
| --- | ---: | ---: | --- |
| Only service identifier \`810\` (\`0x32A\`) | \`0000032A\` | \`000003FF\` | Service identifier occupies bits \`9:0\`, so the lower 10 bits are compared. |
| Only responses for service \`810\` | \`1400032A\` | \`3C0003FF\` | \`command_class=5\` is placed in bits \`29:26\`, plus service bits \`9:0\`. |
| Only traffic from source address \`1\` | \`00002000\` | \`0007E000\` | Source address occupies bits \`18:13\`; value \`1 << 13\` is \`0x2000\`. |
| Only traffic to destination address \`5\` | \`00280000\` | \`01F80000\` | Destination address occupies bits \`24:19\`; value \`5 << 19\` is \`0x280000\`. |
| Only command/request frames to destination \`5\` for service \`810\` | \`1828032A\` | \`3DF803FF\` | Combines command class bits, destination bits, broadcast bit, and service bits. |

:::tip
Start with a broad filter such as only service identifier, then add command class or address bits after confirming the monitor still receives the expected traffic.
:::

:::warning
These examples assume the profile's CAN ID bit layout shown above. If another protocol uses a different arbitration ID layout, calculate the mask from that profile's own CAN ID fields instead.
:::

### TX acknowledgement

\`TX\` in the monitor direction column means the frame was transmitted from the app toward the bus through the daemon. \`TX:pending\` means the app has staged the transmit request and is waiting for daemon acknowledgement. \`TX:sent\` means the daemon reported that the selected CAN interface accepted the frame send call. \`TX:failed\` means the daemon, connection, or selected interface rejected the frame.

:::note
\`TX:sent\` is not the same as an application-level response from the target device. Use cyclic Wait for CAN response when the next send should wait for a received response frame.
:::

### Limitations and planned improvements

- Direct Local CAN from the desktop app is not wired yet; use Remote Daemon.
- Daemon-side filters are raw CAN filters only. Higher-level profile fields must be translated to raw ID/mask filters by the app.
- Response matching in cyclic TX is based on received frames and loaded profile definitions; there is no universal request/response correlation in raw CAN.
- Interface discovery depends on Linux netlink and available SocketCAN interfaces.
- Windows-native daemon builds are not supported because SocketCAN and netlink are Linux-specific.
- Future improvements could include richer filter editing, named filter presets, per-profile response templates, better timeout visualization, and daemon-side metrics.

:::danger
Do not transmit frames on a physical bus unless you know the target system and arbitration impact. Incorrect frames can disturb diagnostics, flashing, or live control messages.
:::

## Editing help content

Open the Edit tab to change this markdown. The View tab renders the final documentation. The Diff tab compares the default content against your custom content.

Use these callout blocks exactly as shown:

\`\`\`markdown
:::note
Use this for neutral information.
:::

:::tip
Use this for workflow advice.
:::

:::warning
Use this for risky but recoverable situations.
:::

:::danger
Use this for destructive or safety-critical situations.
:::
\`\`\`

## Saving and resetting

Save stores your edited help content. Reset removes the custom version and restores the built-in default. Both actions ask for confirmation first.

## Troubleshooting

### Search does not find text

Make sure you are in the View tab. Search operates on rendered help content.

### ToC does not show an entry

Only headings are included in the table of contents. Use \`#\`, \`##\`, or \`###\` headings for navigable sections.

### Custom markdown looks wrong

Check fenced code blocks and directive fences. Each callout must have an opening directive and a closing \`:::\` line.
`;
