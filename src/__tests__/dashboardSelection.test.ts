import { describe, expect, test } from "vitest";
import type { WsFrame } from "@/can-bridge/ws/types";

export function rowKeyFor(frame: WsFrame, index: number) {
  if (frame.line_no != null) {
    return `line-${frame.line_no}`;
  }
  return `frame-${frame.ts_ms}-${frame.iface}-${frame.id}-${index}`;
}

export function resolveSelectedFrame(
  selectedFrameKey: string | null | undefined,
  traceRows: Array<{ key: string; frame: WsFrame }>,
  frames: WsFrame[] = [],
): WsFrame | undefined {
  if (selectedFrameKey) {
    return traceRows.find((row) => row.key === selectedFrameKey)?.frame;
  }
  return traceRows[traceRows.length - 1]?.frame ?? frames[frames.length - 1];
}

describe("rowKeyFor", () => {
  test("generates invariant key using line_no when available", () => {
    const frame: WsFrame = { id: 0x100, is_extended: false, is_fd: false, data_hex: "112233", iface: "can0", dir: "rx", ts_ms: 1000, line_no: 42 };
    expect(rowKeyFor(frame, 10)).toBe("line-42");
    expect(rowKeyFor(frame, 99)).toBe("line-42");
  });
});

describe("resolveSelectedFrame", () => {
  const frame1: WsFrame = { id: 0x100, is_extended: false, is_fd: false, data_hex: "112233", iface: "can0", dir: "rx", ts_ms: 1000, line_no: 1 };
  const frame2: WsFrame = { id: 0x200, is_extended: false, is_fd: false, data_hex: "AABBCC", iface: "can0", dir: "rx", ts_ms: 1001, line_no: 2 };
  const frame3: WsFrame = { id: 0x300, is_extended: false, is_fd: false, data_hex: "FFEEDD", iface: "can0", dir: "rx", ts_ms: 1002, line_no: 3 };

  test("returns latest captured frame when no explicit frame key is selected during live capture", () => {
    const rows = [
      { key: rowKeyFor(frame1, 0), frame: frame1 },
      { key: rowKeyFor(frame2, 1), frame: frame2 },
    ];
    expect(resolveSelectedFrame(null, rows)).toEqual(frame2);

    const updatedRows = [...rows, { key: rowKeyFor(frame3, 2), frame: frame3 }];
    expect(resolveSelectedFrame(null, updatedRows)).toEqual(frame3);
  });

  test("returns selected frame strictly when selectedFrameKey is set and never falls back to fluctuating latest frame if purged", () => {
    const rows = [
      { key: rowKeyFor(frame1, 0), frame: frame1 },
      { key: rowKeyFor(frame2, 1), frame: frame2 },
    ];
    const selectedKey = rowKeyFor(frame1, 0);
    expect(resolveSelectedFrame(selectedKey, rows)).toEqual(frame1);

    // As new frames arrive, selected frame stays locked
    const updatedRows = [...rows, { key: rowKeyFor(frame3, 2), frame: frame3 }];
    expect(resolveSelectedFrame(selectedKey, updatedRows)).toEqual(frame1);

    // When line-1 is purged from buffer limit, MUST NOT fall back to frame3 to avoid fluctuation
    const purgedRows = [
      { key: rowKeyFor(frame2, 1), frame: frame2 },
      { key: rowKeyFor(frame3, 2), frame: frame3 },
    ];
    expect(resolveSelectedFrame(selectedKey, purgedRows)).toBeUndefined();

    // When selection is explicitly cleared/toggled off, resumes live tracking
    expect(resolveSelectedFrame(null, purgedRows)).toEqual(frame3);
  });
});
