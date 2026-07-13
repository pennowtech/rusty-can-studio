# Developer Guide

This guide explains how the Rusty CAN Studio codebase is organized and which internal APIs are stable enough to build on. It is meant for contributors adding monitor features, profile support, transmit behavior, simulator workflows, or quality checks.

## Architecture

Rusty CAN Studio is a Tauri 2 desktop app with a React/TypeScript frontend and a small Rust shell.

```text
src/
  app/                 Main views and workflows
  can/                 CAN helpers and candump parsing
  can-bridge/          WebSocket daemon transport
  commands/            Command palette and shortcuts
  components/          Shared UI, help system, base components
  profile-editor/      Profile model, editor, decoder, validation
  store/               Zustand state stores
src-tauri/
  src/                 Tauri application entry points
profiles/             Shared profile JSON files and generic test fixtures
scripts/              Local setup, quality, audit, and conversion scripts
docs/                 User and developer documentation
```

Keep protocol-specific meaning in JSON profiles. The app should provide generic decode machinery, UI, and transport behavior.

The canonical profile contract is documented in:

- `docs/canonical-profile-guide.md`
- `docs/canonical-profile.schema.json`

New profile-editor work should target that canonical shape. The runtime, visual editor, JSON view, decoder, display filter, transmit helpers, and simulator matching should consume canonical profiles only. External source formats should be converted before import.

## Core Runtime Flow

### Loaded candump flow

1. CAN Monitor reads file text.
2. `parseCandump()` converts matching lines to `WsFrame`.
3. `connectionStore.loadTraceFrames()` loads the parsed rows.
4. CAN Monitor derives trace rows, decoded fields, filters, sorting, and pagination.
5. Export actions serialize the current raw or decoded view.

### Live daemon flow

1. A connection profile creates a WebSocket JSON URL.
2. `WsJsonDaemonClient.connect()` opens the socket and performs `client_hello`.
3. `subscribe()` asks the daemon to stream selected interfaces and optional raw filters.
4. Incoming `frame` messages are buffered in `connectionStore`.
5. The monitor renders retained frames and app-created TX rows.

### Transmit flow

1. The UI calls `connectionStore.sendFrame()`.
2. The store inserts a local `TX:pending` row.
3. `WsJsonDaemonClient.sendFrame()` sends `send_frame`.
4. A `send_ack` updates the pending row to `TX:sent` or `TX:failed`.
5. Wait-for-response behavior uses `connectionStore.waitForFrame()`.

## API Reference

### Candump parser

File: `src/can/candump.ts`

```ts
parseCandump(text: string): WsFrame[]
```

Parses candump-style lines such as:

```text
(000.500017) can1 14089C01 [06] 01 01 07 00 00 00
```

Important behavior:

- invalid lines are ignored
- `line_no` preserves source file line number
- timestamps are converted to `ts_ms`
- payload bytes are normalized to lowercase hex without spaces
- payloads longer than 8 bytes are marked as CAN-FD

### WebSocket daemon client

Files:

- `src/can-bridge/ws/WsJsonDaemonClient.tsx`
- `src/can-bridge/ws/types.ts`

Primary class:

```ts
new WsJsonDaemonClient(daemonUrl)
```

Main methods:

| Method | Purpose |
| --- | --- |
| `connect({ clientName, timeoutMs })` | Open WebSocket and wait for `hello_ack`. |
| `setFrameHandler(handler)` | Register callback for streamed `frame` messages. |
| `ping(id, timeoutMs)` | Send `ping`, wait for matching `pong`. |
| `listIfaces(timeoutMs)` | Ask daemon for SocketCAN interfaces. |
| `subscribe(ifaces, timeoutMs, filters)` | Subscribe to live frames. |
| `unsubscribe(timeoutMs)` | Stop subscription. |
| `sendFrame(params, timeoutMs)` | Send CAN/CAN-FD frame and wait for `send_ack`. |
| `close()` | Close socket and fail pending requests. |

Outbound message types:

- `client_hello`
- `ping`
- `list_ifaces`
- `subscribe`
- `unsubscribe`
- `send_frame`

Inbound message types:

- `hello_ack`
- `pong`
- `ifaces`
- `subscribed`
- `unsubscribed`
- `send_ack`
- `frame`
- `error`

### Frame model

Type: `WsFrame`

Important fields:

| Field | Meaning |
| --- | --- |
| `ts_ms` | Timestamp in milliseconds. |
| `iface` | Interface name such as `vcan0` or `can1`. |
| `dir` | `rx` or `tx`. |
| `id` | Numeric arbitration ID. |
| `is_fd` | Whether the frame is CAN-FD. |
| `data_hex` | Payload hex without spaces. |
| `line_no` | Source line or app-assigned sequence number. |
| `tx_status` | `pending`, `sent`, or `failed` for app-created TX rows. |
| `scenario_status` | Scenario marker such as `tx`, `rx-match`, `timeout`, `retry`, or `stop`. |

Use `WsFrame` for both loaded logs and live traffic so monitor logic stays shared.

### Connection store

File: `src/store/connectionStore.ts`

State responsibilities:

- connection profiles
- active connection state
- daemon interface discovery
- live frame buffer
- loaded trace frames
- retained frame limit
- TX staging and acknowledgement
- response waiters
- scenario annotations

Main actions:

| Action | Purpose |
| --- | --- |
| `connect(id)` | Connect using a saved profile. |
| `discoverRemoteIfaces(profile)` | Query daemon for interfaces. |
| `disconnect()` | Close active daemon client. |
| `pauseCapture()` / `resumeCapture()` | Subscribe or unsubscribe active capture. |
| `clearFrames()` | Clear retained monitor rows. |
| `loadTraceFrames(name, frames)` | Replace monitor rows with parsed log frames. |
| `sendFrame(params)` | Send one frame and update local TX row. |
| `waitForFrame(matches, timeoutMs)` | Resolve when a future frame matches. |
| `annotateFrame(matches, metadata)` | Add scenario metadata to an existing frame. |
| `setTraceFrameLimit(limit)` | Persist and immediately apply retained row limit. |

When adding live-frame behavior, avoid expensive synchronous work in frame handlers. The store batches incoming frames before updating React state.

### Profile model

File: `src/profile-editor/model/profile.ts`

Runtime profile contract:

```ts
type CanonicalProfile = {
  schemaVersion: "1.0";
  meta: CanonicalProfileMeta;
  bus: CanonicalProfileBus;
  layouts: {
    canId: CanonicalLayout;
    payloadHeader?: CanonicalLayout;
  };
  dictionaries?: Record<string, Record<string, string>>;
  messages: CanonicalMessage[];
  errors?: CanonicalErrorRule[];
  display?: Record<string, unknown>;
}
```

Profile Editor Visual, JSON view, CAN Monitor decoding, display filters, transmit helpers, and simulator matching consume the canonical profile shape.

Generic canonical fixtures live under `profiles/test/`. They are intentionally protocol-varied so decoder and editor changes can be checked without relying on private working profiles.

### Profile decoding

Files:

- `src/profile-editor/decodeProfile.ts`

Decoder rules:

- decode CAN ID fields from `layouts.canId.fields`
- decode payload header fields before message matching
- match only profiles whose `messages[].identifyBy` criteria apply
- decode message-specific `payload.fields` after a match
- expose raw and display values when dictionaries exist
- evaluate `errors[]` only when the configured condition indicates failure

Do not hardcode product or protocol meanings in decoder code.

### Help system

Primary files:

- `src/components/help-system/defaultHelpMarkdown.ts`
- `src/components/help-system/HelpShell.tsx`
- `src/components/help-system/markdown/remarkCallouts.ts`

The default Help content is Markdown stored in TypeScript. It supports:

- headings and table of contents
- search
- editable custom content
- callouts: `note`, `tip`, `warning`, `danger`

When adding user-facing workflow features, update Help in the same commit.

## Scripts and Quality Gates

Useful commands:

```bash
npm run test
npm run build
npm run benchmark
npm run accessibility:check
npm run browser:check
npm run audit
npm run security:audit
npm run quality:check
```

Quality expectations:

- run `npm run test` for logic changes
- run `npm run build` for UI or TypeScript changes
- run `npm run quality:check` before pushing larger features
- run `npm run benchmark` before and after performance-sensitive changes
- update docs and Help for user-visible behavior

## Adding A Feature

Recommended sequence:

1. Identify the owning area: monitor, profile editor, simulator, settings, store, or transport.
2. Reuse existing stores and helper APIs before adding a new abstraction.
3. Keep protocol-specific meaning in profile JSON.
4. Add focused tests for pure helper behavior.
5. Update Help and relevant docs.
6. Run the quality checks.

## Adding A Profile Field

1. Add or edit the field under the correct `messages[].payload.fields` entry.
2. Use absolute `startBit` and `bitLength` for bit layout.
3. Add `type`, `factor`, `offset`, `unit`, `dictionary`, `count`, or `strideBits` only when needed.
4. Use `errors[]` for error-code handling.
5. Validate with Decoded Preview and a known frame.

## Adding A Daemon Message

1. Add the TypeScript type in `src/can-bridge/ws/types.ts`.
2. Add it to `WsOutbound` or `WsInbound`.
3. Add a typed method in `WsJsonDaemonClient` if it is a request/response operation.
4. Keep a timeout around every request waiting for a response.
5. Update the connection store only if the UI needs state from that message.
6. Document the message in this guide and the user Help if it changes behavior.

## Coding Rules

- Prefer typed data and narrow unknown JSON values.
- Avoid user-agent browser sniffing; prefer feature checks.
- Keep raw frame parsing separate from profile decoding.
- Keep localStorage keys centralized through existing stores/constants.
- Use `type="button"` on raw `<button>` elements.
- Give icon-only buttons a title or explicit accessible name.
- Keep expensive frame processing out of render loops.

## Current Limits

- Direct local SocketCAN from Windows is not implemented.
- The desktop app relies on the daemon for live Linux SocketCAN access.
- Browser compatibility checks are baseline checks, not full visual regression tests.
- Accessibility checks are baseline checks, not a full WCAG audit.
- The app intentionally does not include compatibility branches for older profile JSON layouts.
