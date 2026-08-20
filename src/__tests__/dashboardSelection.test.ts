import { describe, expect, test } from "vitest";
import type { WsFrame } from "@/can-bridge/ws/types";

function resolveSelectedFrame(
  selectedFrameKey: string | null | undefined,
  sortedRows: Array<{ key: string; frame: WsFrame }>,
): WsFrame | undefined {
  if (!selectedFrameKey) return undefined;
  return sortedRows.find((row) => row.key === selectedFrameKey)?.frame;
}

describe("resolveSelectedFrame", () => {
  const frame1: WsFrame = { id: 0x100, is_extended: false, is_fd: false, data_hex: "112233", interface: "can0", line_no: 1 };
  const frame2: WsFrame = { id: 0x200, is_extended: false, is_fd: false, data_hex: "AABBCC", interface: "can0", line_no: 2 };
  const frame3: WsFrame = { id: 0x300, is_extended: false, is_fd: false, data_hex: "FFEEDD", interface: "can0", line_no: 3 };

  test("returns undefined when no frame key is selected during live capture", () => {
    const rows = [
      { key: "1", frame: frame1 },
      { key: "2", frame: frame2 },
    ];
    // When live capture is running and user has not selected a row, it must NOT fall back to latest row
    expect(resolveSelectedFrame(null, rows)).toBeUndefined();
    expect(resolveSelectedFrame(undefined, rows)).toBeUndefined();
  });

  test("returns selected frame when selectedFrameKey is explicitly set", () => {
    const rows = [
      { key: "1", frame: frame1 },
      { key: "2", frame: frame2 },
    ];
    expect(resolveSelectedFrame("1", rows)).toEqual(frame1);

    // As new frames arrive during live capture
    const updatedRows = [...rows, { key: "3", frame: frame3 }];
    expect(resolveSelectedFrame("1", updatedRows)).toEqual(frame1);
  });
});
