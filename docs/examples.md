# Examples

This page collects common Rusty CAN Studio scenarios with copyable filters, sample frames, and simulator sequence JSON.

Generic canonical profile fixtures and matching candump snippets are committed under `profiles/test/`. Use those files when you want quick, shareable examples that do not depend on local working profiles.

## Example 1: Load A Small Candump Log

Sample candump lines:

```text
(000.000000) can1 18203C01 [02] 01 01
(000.000001) can1 14089C01 [06] 01 01 07 00 00 00
(000.053309) can1 0C08FC01 [06] C1 01 02 00 00 00
(000.500016) can1 18203C01 [02] 01 01
```

Workflow:

1. Save the lines into a `.log` or `.txt` file.
2. Open CAN Monitor.
3. Select Open.
4. Load the file.
5. Select each row and inspect Decoded Preview.

Useful filters:

```text
canId == 18203C01
iface == can1
payload contains "01 01"
len >= 6
```

## Example 2: Filter By A Raw CAN ID Field

If a profile defines a CAN ID field named `service_identifier`, use it directly:

```text
service_identifier == 810
```

If you need the daemon-side raw filter for a layout where the service identifier is in bits `9:0`, translate it to:

```text
CAN ID: 0000032A
Mask:   000003FF
```

The equivalent expression is:

```text
(frame.id & 0x000003FF) == (0x0000032A & 0x000003FF)
```

## Example 3: Find Bad Responses

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

## Example 4: Stage A Known Frame For Transmit

Workflow:

1. Load or capture a known request frame in CAN Monitor.
2. Right click the row.
3. Select Use in Transmit Composer.
4. Confirm CAN ID, payload, DLC, CAN-FD, and BRS.
5. Send once.
6. Watch for `TX:pending`, `TX:sent`, or `TX:failed`.

Use this when the safest starting point is a frame that already exists in a known trace.

## Example 5: Cyclic Request With Expected Response

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

## Example 6: CAN Simulator Sequence

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

## Example 7: Export Evidence

Use raw candump export when you need replayable traffic:

```text
CAN Monitor > Log
```

Use decoded CSV export when you need analysis in a spreadsheet:

```text
CAN Monitor > CSV
```

Before sharing either file, review:

- host and interface names
- CAN identifiers
- decoded message names
- error text
- timing information
- profile metadata
