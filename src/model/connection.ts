/**
 * connection.ts
 * ------------------------------------------------------------
 * Connection profile types and definitions.
 *
 * RESPONSIBILITY
 * - Defines the structure of connection profiles.
 * - Enumerates supported transport protocols.
 *
 * CONVENTIONS
 * - Profiles can be for local or remote connections.
 * - Local connections specify a CAN interface.
 * - Remote connections specify host, port, and protocol.
 * - Supports auto-reconnect option.
 *
 * HOW TO USE
 * - Import and use ConnectionProfile type for managing connection settings.
 */

export type TransportProtocol = "ws-json" | "ws-binary" | "tcp-jsonl" | "tcp-binary" | "grpc";

export type ConnectionMode = "local" | "remote";

export type ConnectionProfile = {
  id: string;
  name: string;

  mode: ConnectionMode;

  // Local
  iface?: string; // e.g. can0

  // Remote
  host?: string;
  port?: number;
  protocol?: TransportProtocol;

  autoReconnect: boolean;
};
