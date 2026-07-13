# Examples

This page collects practical Rusty CAN Studio workflows with copyable filters, sample frames, profile snippets, and simulator sequence JSON.

Generic canonical profile fixtures and matching candump snippets are committed under `profiles/test/`. Use those files when you want quick, shareable examples that do not depend on local working profiles.

## Example 1: Inspect A Candump Log

Use this when you have a saved candump log and no live CAN connection.

Sample candump lines:

```text
(000.000000) can1 18203C01 [02] 01 01
(000.000001) can1 14089C01 [06] 01 01 07 00 00 00
(000.053309) can1 0C08FC01 [06] C1 01 02 00 00 00
(000.500016) can1 18203C01 [02] 01 01
```

Workflow:

1. Save the lines into a `.log`, `.txt`, or `.candump` file.
2. Open CAN Monitor.
3. Select Open.
4. Load the file.
5. Select each row and inspect Decoded Preview.
6. Use the display filter above the table.

Useful filters:

```text
canId == 0x18203C01
iface == can1
payload contains "01 01"
len >= 6
message_good == bad
error
```

Expected result: the table keeps the original file order and source line numbers. Filtering hides rows visually, but it does not renumber the source log.

## Example 2: Load Profiles And Decode Frames

Use this when the monitor shows raw frames but decoded names or fields are missing.

Workflow:

1. Open Profile Editor.
2. Load one or more canonical profile JSON files.
3. Return to CAN Monitor.
4. Select a frame that belongs to one of the loaded profiles.
5. Check Decoded Preview for CAN ID fields, payload header fields, message name, payload values, and error status.

Generic profile and candump pairs are committed under `profiles/test/`. Use them for quick editor and decoder checks when you do not want to load local working profiles.

Expected result: if a frame belongs to a message that is not covered by a loaded profile, it should not borrow names or value maps from unrelated profiles.

## Example 3: Connect To A Remote Daemon

Use this when SocketCAN interfaces exist in Linux or WSL.

Workflow:

1. Start `can_bridge_daemon` where the CAN interface exists.
2. In Rusty CAN Studio, open Connect.
3. Choose Remote Daemon.
4. Enter the WebSocket host and port.
5. Use Discover to list interfaces.
6. Select the interface and connect.
7. Confirm that the status bar shows Connected.

Example daemon run command:

```bash
cargo run -- --tcp-bind 0.0.0.0:9500 --ws-bind 0.0.0.0:9501 --grpc-bind 0.0.0.0:9502
```

For virtual CAN testing in WSL:

```bash
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
```

Expected result: live RX frames appear at the bottom of CAN Monitor. TX rows created by this app are also shown in the monitor.

## Example 4: Use A Daemon Capture Filter

Use this when the bus is too busy and you want the daemon to forward only selected raw CAN frames.

For a profile where a service identifier occupies CAN ID bits `9:0`, service identifier `810` is `0x32A`. Use:

```text
CAN ID: 0000032A
Mask:   000003FF
```

The daemon evaluates:

```text
(frame.id & 0x000003FF) == (0x0000032A & 0x000003FF)
```

Expected result: only frames whose lower 10 CAN ID bits equal `0x32A` are forwarded. If you still receive unrelated frames, confirm that the filter is configured in the daemon connection profile and that the daemon build supports server-side filters.

## Example 5: Filter By A Decoded CAN ID Field

If a loaded profile defines a CAN ID field named `service_identifier`, use it directly in the display filter:

```text
service_identifier == 810
```

You can combine raw and decoded fields:

```text
service_identifier == 810 and dir == "RX"
command_class == response and message_good == bad
```

Use a column header context menu when you want the app to insert a valid filter expression for that column.

## Example 6: Find Bad Responses

If the loaded profile defines `errors[]`, use:

```text
error
hasError == true
message_good == bad
errorCode == 12
errorText contains POSITION
```

Expected result:

- error rows are highlighted
- Decoded Preview shows the error code and text
- decoded CSV export includes the error fields

## Example 7: Profile Editor Visual: Add A CAN ID Field

Use this when a protocol packs multiple fields into the arbitration ID.

Workflow:

1. Open Profile Editor.
2. Load or create a canonical profile.
3. Open Visual.
4. Select Layouts, then CAN ID.
5. Add a field.
6. Set a stable name, for example `priority`.
7. Set `startBit` and `bitLength`.
8. Add a dictionary if numeric values should display as text.
9. Select a CAN Monitor row and check Decoded Preview.

Example field:

```json
{
  "name": "priority",
  "startBit": 26,
  "bitLength": 3,
  "type": "uint"
}
```

Expected result: CAN Monitor can show `priority` as a column and the display filter can use `priority == 3`.

## Example 8: Profile Editor Visual: Add A Payload Header Field

Use this when every payload begins with shared routing, status, or feature bits.

Workflow:

1. Open Profile Editor.
2. Open Visual.
3. Select Layouts, then Payload Header.
4. Add a field with an absolute `startBit` and `bitLength`.
5. Add a dictionary if the field has known text values.
6. Save the profile.
7. Select a matching frame in CAN Monitor.

Example payload header field:

```json
{
  "name": "message_good",
  "startBit": 0,
  "bitLength": 1,
  "type": "bool",
  "dictionary": "good_bad"
}
```

Expected result: payload header fields are visible for matching frames before message-specific payload fields are decoded.

## Example 9: Profile Editor Visual: Add A Message

Use this when a new frame type needs message-specific payload decoding.

Workflow:

1. Open Profile Editor.
2. Open Visual.
3. Select Messages.
4. Add a message.
5. Give it a readable id and name, for example `motor_status`.
6. Add identity conditions such as `service_identifier == 810` and `attribute_address == 3`.
7. Add payload fields.
8. Check Decoded Preview against a known frame.

Example message identity:

```json
{
  "id": "motor_status.response",
  "name": "Motor status response",
  "identifyBy": [
    { "field": "service_identifier", "equals": 810 },
    { "field": "attribute_address", "equals": 3 },
    { "field": "message_good", "equals": 1 }
  ]
}
```

Expected result: message-specific payload fields decode only when all identity conditions match.

## Example 10: Profile Editor JSON: Add A Payload Field

Use JSON view when editing a field is faster as source.

Example payload field:

```json
{
  "name": "speed_rpm",
  "startBit": 16,
  "bitLength": 16,
  "type": "uint",
  "factor": 0.25,
  "unit": "rpm"
}
```

Workflow:

1. Open Profile Editor.
2. Switch to JSON.
3. Add the field under the correct `messages[].payload.fields` array.
4. Save.
5. Switch to Visual and confirm the field appears in the message.
6. Select a known frame and compare the decoded value.

Expected result: CAN Monitor can show `speed_rpm` as a decoded payload value for the matching message.

## Example 11: Profile Editor JSON: Add A Dictionary

Use dictionaries when raw numbers should display as meaningful text.

Example dictionary:

```json
{
  "dictionaries": {
    "switch_state": {
      "0": "off",
      "1": "on"
    }
  }
}
```

Example field using it:

```json
{
  "name": "enable",
  "startBit": 16,
  "bitLength": 1,
  "type": "bool",
  "dictionary": "switch_state"
}
```

Expected result: Decoded Preview shows `enable: on (1)` instead of only `1`, and filters can use the displayed text where applicable.

## Example 12: Profile Editor JSON: Add Error Handling

Use `errors[]` when a status field tells the decoder that payload bytes contain an error code.

Example error rule:

```json
{
  "errors": [
    {
      "id": "bad_response_error",
      "when": "message_good == 0",
      "source": {
        "startBit": 16,
        "bitLength": 32,
        "byteOrder": "little",
        "type": "uint"
      },
      "dictionary": "error_codes"
    }
  ],
  "dictionaries": {
    "error_codes": {
      "12": "ERROR_AXIS_POSITION_NOT_REACHED"
    }
  }
}
```

Expected result: CAN Monitor highlights matching rows as errors, Decoded Preview shows the error text, and filters such as `errorCode == 12` or `errorText contains POSITION` work.

## Example 13: Send One Frame

Use this for a quick manual transmit test.

Workflow:

1. Connect to a remote daemon.
2. Open the transmit composer.
3. Enter CAN ID, DLC, payload, CAN-FD, and BRS settings.
4. Select Send Frame.
5. Watch CAN Monitor for the TX row.

TX status meanings:

| Status | Meaning |
| --- | --- |
| `TX:pending` | The app sent the request and is waiting for daemon acknowledgement. |
| `TX:sent` | The daemon accepted the send call for the selected interface. |
| `TX:failed` | The daemon, connection, or interface rejected the send request. |

`TX:sent` is not the same as a device response. Use Wait for CAN response or a simulator sequence when the next action depends on a received frame.

## Example 14: Stage A Known Frame For Transmit

Workflow:

1. Load or capture a known request frame in CAN Monitor.
2. Right click the row.
3. Select Use in Transmit Composer.
4. Confirm CAN ID, payload, DLC, CAN-FD, and BRS.
5. Send once.
6. Watch for `TX:pending`, `TX:sent`, or `TX:failed`.

Use this when the safest starting point is a frame that already exists in a known trace.

## Example 15: Cyclic Request With Expected Response

Scenario:

- send one request every 500 ms
- wait for a decoded response before scheduling the next request
- stop when the response is late

Configuration:

```text
Period: 500
Unit: ms
Send mode: Wait for CAN response
Expected response: status_poll.response
Response timeout: 1000 ms
Late policy: Stop cyclic TX
Retries: 0
```

Useful monitor filters:

```text
dir == "TX" or message == status_poll.response
txStatus == failed
hasError == true
```

Expected result: the monitor shows repeated TX rows and matching RX rows. If the expected response is not received, the cyclic runner reports what was received or which condition failed.

## Example 16: CAN Simulator Sequence

This sequence sends one frame, waits for a response, then starts cyclic transmission until another response is received.

```json
{
  "name": "Start then poll until response",
  "steps": [
    {
      "id": "send-start",
      "type": "send",
      "name": "Send start command",
      "frameRef": "start.command",
      "canId": "18203C01",
      "payload": "01 01"
    },
    {
      "id": "wait-start-response",
      "type": "wait",
      "name": "Wait for start response",
      "expect": "start.response",
      "condition": "message_good == 1",
      "timeoutMs": 1000,
      "retries": 2,
      "onTimeout": "retry"
    },
    {
      "id": "poll-status",
      "type": "cyclic",
      "name": "Poll status",
      "frameRef": "status.command",
      "canId": "14089C01",
      "payload": "01 01 07 00 00 00",
      "periodMs": 100,
      "maxDurationMs": 10000,
      "stopWhen": {
        "expect": "status.response",
        "condition": "message_good == 1",
        "matches": 1
      },
      "latePolicy": "stop"
    }
  ]
}
```

Workflow:

1. Open CAN Simulator.
2. Select Load JSON.
3. Load the sequence JSON.
4. Connect to the daemon.
5. Run the sequence.
6. Watch the simulator log and CAN Monitor markers.

## Example 17: Save Work For Later

Use this before closing a session or sharing an investigation.

1. Export the raw trace as candump when you need replayable evidence.
2. Export decoded CSV when you need spreadsheet analysis.
3. Save filter and sort presets for repeated investigations.
4. Export settings when you want to move the same layout, theme, and connection setup to another installation.
5. Review exports before sharing because traces and profiles can include internal names, CAN identifiers, host names, and timing data.

## Practice Checklist

After finishing these examples, a new user should be able to:

- Load a candump file.
- Connect to a remote daemon.
- Load profile JSON and read decoded frames.
- Edit canonical profiles in Visual and JSON views.
- Use display filters and column filters.
- Send a single frame.
- Configure cyclic transmission with a response.
- Build a simple simulator sequence.
- Export traces and settings safely.
