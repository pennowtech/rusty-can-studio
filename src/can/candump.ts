import type { WsFrame } from "@/can-bridge/ws/types";

const CANDUMP_LINE = /^\s*\((?<ts>\d+(?:\.\d+)?)\)\s+(?<iface>\S+)\s+(?<id>[0-9a-fA-F]+)\s+\[(?<len>\d+)\]\s*(?<data>.*)$/;

export function parseCandump(text: string): WsFrame[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ groups: line.match(CANDUMP_LINE)?.groups, lineNo: index + 1 }))
    .filter((item): item is { groups: Record<string, string>; lineNo: number } => Boolean(item.groups))
    .map(({ groups, lineNo }) => {
      const dataHex = groups.data
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .join("")
        .toLowerCase();

      return {
        type: "frame" as const,
        ts_ms: Math.round(Number(groups.ts) * 1000),
        iface: groups.iface,
        dir: "rx" as const,
        id: Number.parseInt(groups.id, 16),
        is_fd: Number(groups.len) > 8,
        data_hex: dataHex,
        line_no: lineNo,
      };
    });
}
