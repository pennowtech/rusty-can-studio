/* eslint
  @typescript-eslint/consistent-type-imports: "error"
  @typescript-eslint/no-unused-vars: "error"
  @typescript-eslint/no-floating-promises: "error"
  @typescript-eslint/no-misused-promises: "error"
  @typescript-eslint/explicit-function-return-type: "off"
  no-console: "warn"
*/

/**
 * =============================================================================
 * FILE: ws/types.ts
 * =============================================================================
 * Layer: Frontend transport types (WebSocket JSON)
 *
 * Purpose:
 * - Single source of truth for WS JSON message shapes used by can_bridge_daemon.
 *
 * Conventions:
 * - Types are `PascalCase`, values are `camelCase`.
 * - Discriminated unions use `type` field exactly as the daemon expects.
 * - No `any`. Prefer unknown + narrowing.
 *
 * Protocol alignment:
 * - Handshake: client sends `client_hello`, server replies `hello_ack`. :contentReference[oaicite:4]{index=4}
 * - Requests: ping/list_ifaces/subscribe/unsubscribe/send_frame. :contentReference[oaicite:5]{index=5}
 * - Streaming: server/daemon emits `frame` messages when subscribed. :contentReference[oaicite:6]{index=6}
 * =============================================================================
 */

export type WsClientHello = {
  type: "client_hello";
  client: string;
  protocol: "json";
};

export type WsHelloAck = {
  type: "hello_ack";
  version?: string;
  server_name?: string;
  features?: string[];
};

export type WsPing = { type: "ping"; id: number };
export type WsPong = { type: "pong"; id: number };

export type WsListIfaces = { type: "list_ifaces" };
export type WsIfaces = { type: "ifaces"; items: string[] };

export type WsSubscribe = { type: "subscribe"; ifaces: string[] };
export type WsSubscribed = { type: "subscribed"; ifaces?: string[] };

export type WsUnsubscribe = { type: "unsubscribe" };
export type WsUnsubscribed = { type: "unsubscribed" };

export type WsSendFrame = {
  type: "send_frame";
  iface: string;
  id: number; // CAN arbitration id (u32)
  is_fd: boolean;
  brs?: boolean;
  esi?: boolean;
  data_hex: string; // hex string, no 0x prefix (matches tests)
};

export type WsSendAck = { type: "send_ack"; ok: boolean; error?: string };

export type WsFrame = {
  type: "frame";
  ts_ms: number;
  iface: string;
  dir: "rx" | "tx";
  id: number;
  is_fd: boolean;
  data_hex: string;
  line_no?: number;
  tx_status?: "pending" | "sent" | "failed";
  tx_error?: string;
  tx_origin?: "local" | "daemon";
  tx_sequence?: number;
};

export type WsError = { type: "error"; message: string };

export type WsOutbound = WsClientHello | WsPing | WsListIfaces | WsSubscribe | WsUnsubscribe | WsSendFrame;

export type WsInbound = WsHelloAck | WsPong | WsIfaces | WsSubscribed | WsUnsubscribed | WsSendAck | WsFrame | WsError;

// This is a "type guard" for inbound messages (from daemon to client):
// if it returns true, TypeScript will treat `value` as WsInbound.
// ? How this function works: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates
export function isWsInbound(value: unknown): value is WsInbound {
  // JSON.parse can return null, numbers, strings, arrays, objects...
  if (typeof value !== "object" || value === null) return false;

  // We only require that a daemon message has a `type` field that is a string.
  // (we can tighten this later if required.)
  const maybeObjectWithType = value as { type?: unknown };
  return typeof maybeObjectWithType.type === "string";
}
