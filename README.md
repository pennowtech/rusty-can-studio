# Rusty CAN Studio

Rusty CAN Studio is a desktop workbench for CAN and CAN-FD traffic. It is built with Tauri, React, TypeScript, and Rust. The app is meant for people who need to inspect CAN traces, decode frames with JSON profiles, transmit frames through a bridge daemon, and build repeatable test or simulation workflows without writing a full custom tool every time.

The current focus is CAN-FD workflows with remote SocketCAN access through `can_bridge_daemon`. You can still load candump logs locally and use the decoder/profile tools without a live daemon connection.

## What It Does

- Open candump logs and inspect them in CAN Monitor.
- Connect to a remote CAN bridge daemon running on Linux or WSL.
- Subscribe to SocketCAN interfaces such as `vcan0`, `can0`, or `can1`.
- Display live RX frames and locally transmitted TX rows in one trace table.
- Decode CAN ID fields, payload headers, payload values, and error status using JSON profiles.
- Filter trace rows with Wireshark-style display filters.
- Reorder, show, and hide monitor columns.
- Export raw candump logs and decoded CSV views.
- Send single CAN/CAN-FD frames from the transmit composer.
- Run cyclic transmission with daemon ACK or CAN response waiting.
- Build multi-step CAN Simulator sequences for send/wait/cyclic/delay workflows.
- Edit profiles visually or directly as JSON.
- Use built-in Help, keyboard shortcuts, themes, and density settings.

## How The Pieces Fit Together

The desktop app does not talk to Linux SocketCAN directly from Windows. For live capture and transmit, run `can_bridge_daemon` where the CAN interfaces exist, usually Linux or WSL. The daemon forwards frames to the app over WebSocket and accepts transmit requests back from the app.

Typical setup:

```text
Rusty CAN Studio on Windows
        |
        | WebSocket JSON
        v
can_bridge_daemon in WSL/Linux
        |
        | SocketCAN
        v
vcan0 / can0 / can1
```

For offline work, you can skip the daemon and load candump logs directly.

## Quick Start

If you just want to try a ready-built package, download the latest release from GitHub:

- Rusty CAN Studio releases: https://github.com/pennowtech/rusty-can-studio/releases

For a guided Windows developer setup, run:

```powershell
./scripts/setup-windows.ps1
```

Install dependencies:

```bash
npm install
```

Run the frontend in a browser:

```bash
npm run dev
```

Run as a Tauri desktop app:

```bash
npm run tauri dev
```

Build the frontend:

```bash
npm run build
```

Build a desktop package:

```bash
npm run tauri build
```

On Windows, if you only want the MSI bundle:

```bash
npm run tauri build -- --bundles msi
```

## Using The App

For a step-by-step onboarding path, start with `docs/tutorials.md`. It walks through loading a candump log, connecting to the daemon, loading profiles, filtering, transmitting, cyclic TX, simulator sequences, and exporting work.

### Open A Candump Log

1. Open CAN Monitor.
2. Click Open.
3. Select a `.log`, `.txt`, or `.candump` file.
4. The table shows the loaded frames in file order.
5. Load a profile JSON if you want decoded fields and message names.

Loaded logs keep their original order and line numbers. Display filters hide rows visually but do not renumber the source lines.

### Connect To A Live CAN Interface

1. Start `can_bridge_daemon` in Linux or WSL.
2. In Rusty CAN Studio, open Connect.
3. Choose Remote Daemon.
4. Enter the daemon host and WebSocket port.
5. Use Discover to list interfaces from the daemon.
6. Select the interface and connect.
7. CAN Monitor starts receiving live frames.

Example daemon command:

```bash
cargo run -- \
  --tcp-bind 0.0.0.0:9500 \
  --ws-bind 0.0.0.0:9501 \
  --grpc-bind 0.0.0.0:9502
```

For WSL, the app usually connects to the WSL host address or `localhost`, depending on how networking is configured.

To prepare common Linux/WSL daemon prerequisites from this repo, run:

```bash
bash scripts/setup-linux-daemon-prereqs.sh
```

### Decode Frames With Profiles

Profiles are JSON files that describe how CAN IDs, payload headers, attributes, operations, and payload values should be decoded. The decoder should stay generic: protocol-specific meaning belongs in the JSON profile, not hardcoded app logic.

You can:

- Import one or more profile JSON files.
- View/edit a profile visually.
- Edit the raw JSON directly.
- Use decoded fields in CAN Monitor columns and display filters.
- Jump from decoded preview entries back into the profile editor.

Profile matching is intentionally conservative. A profile should only decode a message when the relevant CAN ID and payload header fields match that profile.

### Use Display Filters

The display filter sits above the CAN Monitor table. Use it to narrow the current trace without deleting frames.

Examples:

```text
canId == 0x18203C01
service_identifier == 810
message_good == 0
error_status contains "POSITION"
dir == "TX"
```

You can also right click a column header to add a filter expression for that column.

### Transmit Frames

The transmit composer is for quick manual TX:

1. Enter CAN ID, DLC, payload, and mode.
2. Click Send Frame.
3. Watch the monitor for `TX:pending`, `TX:sent`, or `TX:failed`.

Right click any monitor row and choose Use in Transmit Composer to stage that frame for sending.

### Cyclic TX

Cyclic TX repeatedly sends the current composer frame. It supports:

- Fire and forget.
- Wait for daemon ACK.
- Wait for a CAN response.
- Response timeout.
- Late response policy.
- Retry count.

Use this when one frame needs to be sent repeatedly. For multi-step behavior, use CAN Simulator sequences instead.

### CAN Simulator Sequences

CAN Simulator is for workflows that are larger than one manual send or one cyclic frame. A sequence is an ordered state machine made of generic steps:

- Send once.
- Wait for response.
- Send cyclically.
- Delay.
- Branch.

Example workflow:

```text
1. Send frame A once.
2. Wait for a successful response to frame A.
3. Start cyclic transmission of frame B.
4. Stop cyclic frame B when the expected response arrives.
```

The sequence runner uses the same transmit and live capture path as CAN Monitor. Scenario-related frames are marked in the monitor with labels such as `SEQ:tx` and `SEQ:rx-match`.

## Project Structure

```text
src/
  app/                 Main application views
  can/                 candump parsing and CAN helpers
  can-bridge/          WebSocket client types and transport glue
  commands/            Command palette and shortcut registry
  components/          Shared UI and help system
  profile-editor/      Profile model, visual editor, decoder, validation
  store/               Zustand stores
src-tauri/
  src/                 Rust side of the Tauri app
  tauri.conf.json      Tauri app and bundle configuration
profiles/             Example/profile JSON files
scripts/              Profile conversion and helper scripts
docs/                 Design and implementation notes
```

## Development Notes

Useful commands:

```bash
npm run dev
npm run build
npm run test
npm run benchmark
npm run accessibility:check
npm run browser:check
npm run quality:check
npm run tauri dev
npm run tauri build -- --bundles msi
```

The app uses:

- React 19
- Vite
- TypeScript
- Tauri 2
- Zustand
- Radix UI primitives
- Tailwind CSS
- Monaco editor
- react-virtuoso for large trace tables

When changing monitor behavior, keep performance in mind. Live capture can produce many frames quickly, so avoid heavy synchronous work during typing, filtering, or row rendering.

When changing decoding behavior, keep protocol knowledge in JSON profiles. The app should know how to apply a profile, but it should not know one specific protocol's field meanings in code.

For a fuller local quality pass, run `npm run quality:check`. It runs unit tests, production build, accessibility baseline checks, browser compatibility baseline checks, dependency audit, and Rust `cargo check`. Use `npm run benchmark` when changing trace parsing, filtering, decoding, or other performance-sensitive paths. The CI quality workflow runs the core compile/test checks on pull requests and pushes to `main`. More detail is in `docs/testing.md`.

## Security Checks

Run the local security baseline before sharing changes:

```bash
npm run audit
```

On Windows, the fuller helper is:

```powershell
npm run security:audit
```

The detailed checklist is in `docs/security-audit.md`. It covers dependency audits, accidental-secret checks, trace/profile review, and remote daemon exposure notes.

## Release

The app version is stored in:

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

For a Windows MSI release:

```bash
npm run build
npm run tauri build -- --bundles msi
```

The MSI is written under:

```text
src-tauri/target/release/bundle/msi/
```

## Troubleshooting

### `cargo` Is Not Found

Install Rust:

```bash
curl https://sh.rustup.rs -sSf | sh
source ~/.cargo/env
```

### `protoc` Is Missing For The Daemon

Install protobuf compiler in Linux or WSL:

```bash
sudo apt install protobuf-compiler
```

### Live Capture Shows Nothing

Check:

- The daemon is running.
- The app is connected to the right host and port.
- The selected interface exists.
- The daemon is subscribed to the interface.
- Capture filters are not excluding the frames.
- WSL or firewall networking is not blocking the WebSocket connection.

### TX Is Sent But No Response Arrives

`TX:sent` only means the daemon accepted the send request for the selected SocketCAN interface. It does not guarantee that a target device responded. Use Wait for CAN response or a Simulator sequence when response correlation matters.

## License

GPL-3.0
