import { describe, expect, test } from "vitest";

const defaultColumnWidths: Record<string, number> = {
  line: 68,
  time: 110,
  iface: 72,
  canId: 88,
  dir: 60,
  len: 54,
  mode: 72,
  payload: 180,
};

type TraceColumnInfo = {
  id: string;
  label: string;
};

type SampleTraceRow = {
  values: Record<string, string>;
};

function getColumnBaseWidth(column: TraceColumnInfo): number {
  if (defaultColumnWidths[column.id]) {
    return defaultColumnWidths[column.id];
  }
  return Math.max(80, column.label.length * 9 + 40);
}

function updateMonotonicColumnWidths(
  prevWidths: Record<string, number>,
  columns: TraceColumnInfo[],
  rows: SampleTraceRow[],
): Record<string, number> {
  if (!rows.length) return {};

  const next = { ...prevWidths };
  let changed = false;

  for (const column of columns) {
    const baseWidth = getColumnBaseWidth(column);
    let maxObserved = prevWidths[column.id] ?? baseWidth;

    for (const row of rows) {
      const cellText = row.values[column.id] ?? "";
      const required = Math.max(baseWidth, cellText.length * 8 + 32);
      if (required > maxObserved) {
        maxObserved = required;
      }
    }

    maxObserved = Math.min(800, maxObserved);

    if (prevWidths[column.id] !== maxObserved) {
      next[column.id] = maxObserved;
      changed = true;
    }
  }

  return changed ? next : prevWidths;
}

describe("updateMonotonicColumnWidths", () => {
  const columns: TraceColumnInfo[] = [
    { id: "line", label: "Line" },
    { id: "canId", label: "CAN ID" },
    { id: "payload", label: "Payload" },
  ];

  test("initializes column widths to base minimums when rows are small", () => {
    const rows: SampleTraceRow[] = [
      { values: { line: "1", canId: "123", payload: "11 22" } },
    ];

    const widths = updateMonotonicColumnWidths({}, columns, rows);
    expect(widths.line).toBe(defaultColumnWidths.line);
    expect(widths.canId).toBe(defaultColumnWidths.canId);
    expect(widths.payload).toBe(defaultColumnWidths.payload);
  });

  test("expands column width when wider data arrives during live capture or log import", () => {
    const rows: SampleTraceRow[] = [
      { values: { line: "1", canId: "123", payload: "11 22" } },
    ];
    let widths = updateMonotonicColumnWidths({}, columns, rows);
    const initialPayloadWidth = widths.payload;

    // Longer payload arrives (e.g. 64-byte CAN FD payload)
    const longPayload = "01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20";
    const updatedRows = [...rows, { values: { line: "2", canId: "123", payload: longPayload } }];

    widths = updateMonotonicColumnWidths(widths, columns, updatedRows);
    expect(widths.payload).toBeGreaterThan(initialPayloadWidth);
    expect(widths.payload).toBe(longPayload.length * 8 + 32);
  });

  test("does NOT contract column width back when a shorter frame arrives later", () => {
    const longPayload = "01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20";
    const rows: SampleTraceRow[] = [
      { values: { line: "1", canId: "123", payload: longPayload } },
    ];

    const widths = updateMonotonicColumnWidths({}, columns, rows);
    const expandedPayloadWidth = widths.payload;

    // Shorter payload arrives
    const nextRows = [...rows, { values: { line: "2", canId: "123", payload: "AA BB" } }];
    const nextWidths = updateMonotonicColumnWidths(widths, columns, nextRows);

    // Should maintain the expanded width, never contract
    expect(nextWidths.payload).toBe(expandedPayloadWidth);
  });

  test("resets column widths back to empty/baseline when trace is cleared", () => {
    const widths = { payload: 450, canId: 120 };
    const resetWidths = updateMonotonicColumnWidths(widths, columns, []);
    expect(resetWidths).toEqual({});
  });
});
