import type { WsFrame } from "@/can-bridge/ws/types";

// Two line shapes need to be understood here: this app's own exported
// format (bracket length, space-separated bytes - what formatCandumpLine
// below produces, so round-tripping export->import works), and the actual
// `candump -l` log format real SocketCAN tooling writes, which uses
// `id#data` (classic CAN) or `id##<flags><data>` (CAN FD) instead - no
// bracket, no spaces. Loading a real candump log previously silently
// produced zero frames because only the bracket shape was recognized.
const CANDUMP_PREFIX = /^\s*\((?<ts>\d+(?:\.\d+)?)\)\s+(?<iface>\S+)\s+(?<id>[0-9a-fA-F]+)\s*(?<rest>.*)$/;
const BRACKET_REST = /^\[(?<len>\d+)\]\s*(?<data>.*)$/;

export function parseCandump(text: string): WsFrame[] {
  const lines = text.split(/\r?\n/);
  const frames: WsFrame[] = [];

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(CANDUMP_PREFIX);
    if (!match?.groups) continue;
    const { ts, iface, id, rest } = match.groups;
    const trimmedRest = rest.trim();

    let dataHex: string;
    let isFd: boolean;

    const bracketMatch = trimmedRest.match(BRACKET_REST);
    if (bracketMatch?.groups) {
      dataHex = bracketMatch.groups.data.trim().split(/\s+/).filter(Boolean).join("").toLowerCase();
      isFd = Number(bracketMatch.groups.len) > 8;
    } else if (trimmedRest.startsWith("##")) {
      // CAN FD hash format: ##<flags-nibble><data>
      dataHex = trimmedRest.slice(3).toLowerCase();
      isFd = true;
    } else if (trimmedRest.startsWith("#")) {
      // Classic CAN hash format: #<data> (or #R.. for a remote frame)
      const payload = trimmedRest.slice(1);
      dataHex = /^R/i.test(payload) ? "" : payload.toLowerCase();
      isFd = false;
    } else {
      continue;
    }

    frames.push({
      type: "frame",
      ts_ms: Math.round(Number(ts) * 1000),
      iface,
      dir: "rx",
      id: Number.parseInt(id, 16),
      is_fd: isFd,
      data_hex: dataHex,
      line_no: index + 1,
    });
  }

  return frames;
}
