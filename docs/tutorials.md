# Tutorials

This guide is a practical starting path for Rusty CAN Studio. It is written for new users who want to get useful results without learning every panel first.

## Tutorial 1: Inspect A Candump Log

Use this when you have a saved candump log and no live CAN connection.

1. Open CAN Monitor.
2. Select Open candump.
3. Choose a `.log`, `.txt`, or `.candump` file.
4. Confirm that the table title changes to the loaded file name.
5. Select a row and inspect Decoded Preview.
6. Use the display filter above the table.

Useful filters:

```text
canId == 0x18203C01
payload contains "01 01"
message_good == bad
error
```

Expected result: the table keeps the original file order and source line numbers. Filtering hides rows visually, but it does not renumber the source log.

## Tutorial 2: Load Profiles And Decode Frames

Use this when the monitor shows raw frames but decoded names or fields are missing.

1. Open Profile Editor.
2. Load one or more canonical profile JSON files.
3. Return to CAN Monitor.
4. Select a frame that belongs to one of the loaded profiles.
5. Check Decoded Preview for CAN ID fields, payload header fields, message name, payload values, and error status.

If a frame belongs to a service or message that is not covered by a loaded profile, it should not borrow names or value maps from unrelated profiles. Load the correct profile or inspect the raw CAN ID and payload values.

Generic profile and candump pairs are committed under `profiles/test/`. Use them for quick editor and decoder checks when you do not want to load local working profiles.

## Tutorial 3: Connect To A Remote Daemon

Use this when SocketCAN interfaces exist in Linux or WSL.

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

## Tutorial 4: Use A Daemon Capture Filter

Use this when the bus is too busy and you want the daemon to forward only selected raw CAN frames.

For a protocol where the service identifier occupies bits `9:0`, service identifier `810` is `0x32A`. Use:

```text
CAN ID: 0000032A
Mask:   000003FF
```

The daemon evaluates:

```text
(frame.id & 0x000003FF) == (0x0000032A & 0x000003FF)
```

Expected result: only frames whose lower 10 CAN ID bits equal `0x32A` are forwarded. If you still receive unrelated frames, confirm that the filter is configured in the daemon connection profile and that the daemon build supports server-side filters.

## Tutorial 5: Send One Frame

Use this for a quick manual transmit test.

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

## Tutorial 6: Build A Cyclic Request

Use this when one request should be sent repeatedly until a response or timeout policy stops it.

1. Load or capture a known request frame in CAN Monitor.
2. Right click the row.
3. Choose Use in Transmit Composer.
4. Open Cyclic TX settings.
5. Set the period, for example `500 ms`.
6. Set Send mode to Wait for CAN response.
7. Choose an expected response from loaded profiles.
8. Set timeout and late-response policy.
9. Start cyclic TX.

Expected result: the monitor shows repeated TX rows and matching RX rows. If the expected response is not received, the cyclic runner reports what was received or which condition failed.

## Tutorial 7: Create A Simulator Sequence

Use this when the workflow has multiple steps, such as send once, wait, then poll cyclically.

1. Open CAN Simulator.
2. Add a sequence.
3. Add a Send Once step.
4. Add a Wait For Response step.
5. Add a Send Cyclic step.
6. Define the stop response and condition.
7. Run the sequence and inspect the run log.

Example sequence:

```text
1. Send start command once.
2. Wait for start response with message_good == 1.
3. Send status request cyclically every 100 ms.
4. Stop when the expected status response arrives or timeout policy fails.
```

Expected result: CAN Monitor marks sequence-related frames, and the simulator log keeps step status even when switching views.

## Tutorial 8: Save Work For Later

Use this before closing a session or sharing an investigation.

1. Export the raw trace as candump when you need replayable evidence.
2. Export decoded CSV when you need spreadsheet analysis.
3. Save filter and sort presets for repeated investigations.
4. Export settings when you want to move the same layout, theme, and connection setup to another installation.
5. Review exports before sharing because traces and profiles can include internal names, CAN identifiers, host names, and timing data.

## Practice Checklist

After finishing these tutorials, a new user should be able to:

- Load a candump file.
- Connect to a remote daemon.
- Load profile JSON and read decoded frames.
- Use display filters and column filters.
- Send a single frame.
- Configure cyclic transmission with a response.
- Build a simple simulator sequence.
- Export traces and settings safely.
