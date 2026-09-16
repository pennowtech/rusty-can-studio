import { createFieldColumnsStore } from "@sbt/desktop-kit/utils/createFieldColumnsStore";

// Pinned CAN-ID/payload field columns for the trace table (CanFdDashboard) -
// see createFieldColumnsStore.ts for the pin/order/width/suggestions-visible
// logic this shares with mqttx-next's own Live Capture columns. Field ids
// here reuse the same "canId:<name>" / "payload:<name>" convention as
// CanFdDashboard's own TraceColumn.id (profileCanIdColumns/
// profilePayloadColumns) rather than bare field names, so a pinned entry is
// unambiguous about which decoded group it came from and maps straight onto
// an existing TraceColumn without a lookup table.
export const useFieldColumnsStore = createFieldColumnsStore("cansim.monitor");
