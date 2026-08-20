import { describe, expect, test } from "vitest";
import type { WsFrame } from "@/can-bridge/ws/types";

function accumulateFilteredRows<T extends { frame: WsFrame }>(
  existing: T[],
  newRows: T[],
  matchesFilter: (row: T) => boolean,
  limit: number,
): T[] {
  const matching = newRows.filter(matchesFilter);
  if (!matching.length) return existing;
  const combined = [...existing, ...matching];
  return combined.slice(Math.max(0, combined.length - limit));
}

export function resolveFilteredRows<T extends { frame: WsFrame }>(
  isFilterActive: boolean,
  isLiveStreaming: boolean,
  accumulated: T[],
  allRows: T[],
  matchesFilter: (row: T) => boolean,
): T[] {
  if (!isFilterActive) return allRows;
  if (isLiveStreaming) return accumulated;
  return allRows.filter(matchesFilter);
}

describe("accumulateFilteredRows", () => {
  const frame1: WsFrame = { id: 0x123, is_extended: false, is_fd: false, data_hex: "112233", iface: "can0", dir: "rx", ts_ms: 1000, line_no: 1 };
  const frame2: WsFrame = { id: 0x200, is_extended: false, is_fd: false, data_hex: "AABBCC", iface: "can0", dir: "rx", ts_ms: 1001, line_no: 2 };
  const frame3: WsFrame = { id: 0x200, is_extended: false, is_fd: false, data_hex: "FFEEDD", iface: "can0", dir: "rx", ts_ms: 1002, line_no: 3 };
  const frame4: WsFrame = { id: 0x123, is_extended: false, is_fd: false, data_hex: "445566", iface: "can0", dir: "rx", ts_ms: 1003, line_no: 4 };

  const matchesId123 = (row: { frame: WsFrame }) => row.frame.id === 0x123;

  test("does not evict matching frames when noise frames on other CAN IDs arrive", () => {
    let accumulated = accumulateFilteredRows([], [{ frame: frame1 }], matchesId123, 500);
    expect(accumulated).toEqual([{ frame: frame1 }]);

    accumulated = accumulateFilteredRows(accumulated, [{ frame: frame2 }, { frame: frame3 }], matchesId123, 500);
    expect(accumulated).toEqual([{ frame: frame1 }]);

    accumulated = accumulateFilteredRows(accumulated, [{ frame: frame4 }], matchesId123, 500);
    expect(accumulated).toEqual([{ frame: frame1 }, { frame: frame4 }]);
  });

  test("respects buffer capacity limit for matching frames", () => {
    let accumulated = accumulateFilteredRows([], [{ frame: frame1 }], matchesId123, 1);
    expect(accumulated).toEqual([{ frame: frame1 }]);

    accumulated = accumulateFilteredRows(accumulated, [{ frame: frame4 }], matchesId123, 1);
    expect(accumulated).toEqual([{ frame: frame4 }]);
  });
});

describe("resolveFilteredRows", () => {
  const frame1: WsFrame = { id: 0x123, is_extended: false, is_fd: false, data_hex: "112233", iface: "can0", dir: "rx", ts_ms: 1000, line_no: 1 };
  const frame2: WsFrame = { id: 0x200, is_extended: false, is_fd: false, data_hex: "AABBCC", iface: "can0", dir: "rx", ts_ms: 1001, line_no: 2 };
  const matchesId123 = (row: { frame: WsFrame }) => row.frame.id === 0x123;

  test("filters static captured rows when live capture is disconnected or stopped", () => {
    const captured = [{ frame: frame1 }, { frame: frame2 }];
    const result = resolveFilteredRows(true, false, [], captured, matchesId123);
    expect(result).toEqual([{ frame: frame1 }]);
  });

  test("uses live streaming accumulator when live capture is active", () => {
    const captured = [{ frame: frame1 }, { frame: frame2 }];
    const liveAccumulated = [{ frame: frame1 }];
    const result = resolveFilteredRows(true, true, liveAccumulated, captured, matchesId123);
    expect(result).toEqual(liveAccumulated);
  });
});
