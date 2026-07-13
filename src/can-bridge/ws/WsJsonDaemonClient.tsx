/* eslint
  @typescript-eslint/no-floating-promises: "error"
  @typescript-eslint/no-misused-promises: "error"
  @typescript-eslint/consistent-type-imports: "error"
  no-console: "warn"
*/

/**
 * =============================================================================
 * FILE: ws/WsJsonDaemonClient.ts
 * =============================================================================
 * Layer: Frontend transport (WebSocket JSON)
 *
 * Purpose:
 * - A small, test-aligned WS client:
 *   - connect + handshake (client_hello -> hello_ack)
 *   - unary requests (ping, list_ifaces, send_frame, subscribe/unsubscribe)
 *   - streaming frames via a callback
 *
 * Conventions:
 * - “Public API” is a class with explicit lifecycle: connect() / close().
 * - Unary requests use `sendAndWait()` with a predicate instead of hidden magic.
 * - Timeouts are required for every unary.
 *
 * Protocol alignment:
 * - Based on `test_can_bridge_ws.py`. :contentReference[oaicite:7]{index=7}
 * =============================================================================
 */

import type {
  WsInbound,
  WsOutbound,
  WsFrame,
  WsFrameFilter,
  WsHelloAck,
  WsIfaces,
  WsPong,
  WsSendAck,
  WsSubscribed,
  WsUnsubscribed,
} from "./types";
import { isWsInbound } from "./types";

type FrameHandler = (frame: WsFrame) => void;

// A pending waiter for a response message.
// Used by waitFor(...) to track outstanding requests.
type PendingResponseWaiter = {
  // Resolve/reject are for the Promise returned by waitFor(...)
  resolve: (message: WsInbound) => void;
  reject: (error: Error) => void;

  // matches decides whether a given inbound message is the answer for this waiter
  matches: (message: WsInbound) => boolean;

  // used to cancel the timeout when the waiter succeeds
  timeoutId: number;
};

export class WsJsonDaemonClient {
  private socket: WebSocket | null = null;

  // If we fire a request and then `await waitFor(...)`,
  // that waiter object is stored here until matched.
  private readonly pendingResponses: PendingResponseWaiter[] = [];
  private readonly unmatchedResponses: WsInbound[] = [];

  // Streaming frames are delivered via this callback (set by the app)
  private onFrame: FrameHandler | null = null;

  constructor(private readonly daemonUrl: string) {}

  setFrameHandler(handler: FrameHandler | null) {
    this.onFrame = handler;
  }

  async connect(params: { clientName: string; timeoutMs?: number }): Promise<WsHelloAck> {
    const timeoutMs = params.timeoutMs ?? 3000;

    const socket = new WebSocket(this.daemonUrl);
    this.socket = socket;

    // Convert onopen/onerror into a Promise so we can await it.
    const openPromise = new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => reject(new Error("WebSocket open timeout")), timeoutMs);

      socket.onopen = () => {
        window.clearTimeout(timeoutId);
        resolve();
      };
      socket.onerror = () => {
        window.clearTimeout(timeoutId);
        reject(new Error("WebSocket error while opening"));
      };
    });

    socket.onmessage = (event) => this.handleRawMessage(event.data);
    socket.onclose = () => this.failAllPendingRequests(new Error("WebSocket closed"));

    // Wait until the socket is open
    await openPromise;

    const helloAckPromise = this.waitFor(
      (message): message is WsHelloAck => message.type === "hello_ack",
      timeoutMs,
    );

    this.send({ type: "client_hello", client: params.clientName, protocol: "json" });

    const helloAck = await helloAckPromise;

    return helloAck;
  }

  // Close the WebSocket and fail all pending requests.
  close() {
    try {
      this.socket?.close();
    } finally {
      this.socket = null;
      this.failAllPendingRequests(new Error("Client Disconnected"));
    }
  }

  async ping(pingId: number, timeoutMs = 3000): Promise<WsPong> {
    this.send({ type: "ping", id: pingId });
    return this.waitFor((message): message is WsPong => message.type === "pong" && message.id === pingId, timeoutMs);
  }

  async listIfaces(timeoutMs = 3000): Promise<WsIfaces> {
    this.send({ type: "list_ifaces" });
    return this.waitFor((message): message is WsIfaces => message.type === "ifaces", timeoutMs);
  }

  async subscribe(ifaces: string[], timeoutMs = 3000, filters?: WsFrameFilter[]): Promise<WsSubscribed> {
    this.send({ type: "subscribe", ifaces, filters });
    return this.waitFor((message): message is WsSubscribed => message.type === "subscribed", timeoutMs);
  }

  async unsubscribe(timeoutMs = 3000): Promise<WsUnsubscribed> {
    this.send({ type: "unsubscribe" });
    return this.waitFor((message): message is WsUnsubscribed => message.type === "unsubscribed", timeoutMs);
  }

  async sendFrame(
    params: {
      iface: string;
      arbitrationId: number;
      isFd: boolean;
      brs?: boolean;
      esi?: boolean;
      dataHex: string;
    },
    timeoutMs = 3000,
  ): Promise<WsSendAck> {
    this.send({
      type: "send_frame",
      iface: params.iface,
      id: params.arbitrationId,
      is_fd: params.isFd,
      brs: params.brs ?? false,
      esi: params.esi ?? false,
      data_hex: params.dataHex,
    });

    return this.waitFor((message): message is WsSendAck => message.type === "send_ack", timeoutMs);
  }

  // -------------------- internals --------------------

  private send(message: WsOutbound) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    socket.send(JSON.stringify(message));
  }

  private handleRawMessage(raw: unknown) {
    if (typeof raw !== "string") return;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return;
    }

    if (!isWsInbound(parsedJson)) return;
    const inboundMessage = parsedJson as WsInbound;

    // Streaming frames: deliver immediately and do NOT resolve any PendingResponse Waiter.
    if (inboundMessage.type === "frame") {
      this.onFrame?.(inboundMessage);
      return;
    }

    // Resolve first matching waiter (FIFO).
    // Matches are expected to be specific enough to avoid ambiguity.
    // Otherwise, the first matching waiter will win.
    // This is aligned with test behavior. :contentReference[oaicite:10]{index=10}
    // E.g., multiple pings with different IDs will be matched correctly.
    for (let i = 0; i < this.pendingResponses.length; i++) {
      const pendingResponse = this.pendingResponses[i];
      if (pendingResponse.matches(inboundMessage)) {
        this.pendingResponses.splice(i, 1);
        window.clearTimeout(pendingResponse.timeoutId);
        pendingResponse.resolve(inboundMessage);
        return;
      }
    }

    this.unmatchedResponses.push(inboundMessage);
  }

  private waitFor<T extends WsInbound>(matches: (msg: WsInbound) => msg is T, timeoutMs: number): Promise<T> {
    const queuedIndex = this.unmatchedResponses.findIndex(matches);
    if (queuedIndex >= 0) {
      const [message] = this.unmatchedResponses.splice(queuedIndex, 1);
      return Promise.resolve(message as T);
    }

    return new Promise<T>((resolve, reject) => {
      // If timeout triggers, remove respective pendingResponse and reject
      const timeoutId = window.setTimeout(() => {
        this.removePendingResponse(timeoutId);
        reject(new Error("Timeout waiting for response"));
      }, timeoutMs);

      this.pendingResponses.push({
        resolve: (message) => resolve(message as T),
        reject,
        matches,
        timeoutId,
      });
    });
  }

  private removePendingResponse(timeoutId: number) {
    const idx = this.pendingResponses.findIndex((w) => w.timeoutId === timeoutId);
    if (idx >= 0) this.pendingResponses.splice(idx, 1);
  }

  private failAllPendingRequests(err: Error) {
    while (this.pendingResponses.length) {
      const pendingResponse = this.pendingResponses.shift()!;
      window.clearTimeout(pendingResponse.timeoutId);
      pendingResponse.reject(err);
    }
  }
}
