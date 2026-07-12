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

## Appearance settings

Open Settings to change how the whole application looks and feels. Appearance changes apply immediately and are saved for the next session.

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
- Send mode: fire-and-forget, or wait for daemon ACK before scheduling the next frame.
- Late ACK policy: skip the missed period, send the next frame immediately, or stop cyclic TX.

Fire-and-forget keeps the requested cadence and does not wait for acknowledgement before scheduling the next send. Wait-for-ACK avoids piling up sends when the daemon or bus is slow, and is the safer default when the target expects request pacing.

:::warning
The current daemon protocol acknowledges transmit acceptance only. It does not yet provide request/response correlation, so related RX responses are observed as normal received frames in the monitor.
:::

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
