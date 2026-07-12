import { create } from "zustand";

export type MonitorColumnId = "line" | "time" | "iface" | "canId" | "dir" | "len" | "mode" | "payload";
export type DecodedPreviewColumnId = "field" | "bits" | "raw" | "value" | "meaning";

type MonitorPreferencesState = {
  search: string;
  selectedTraceRowKey?: string;
  columnOrder: string[];
  showDecodedPreview: boolean;
  showTransmitComposer: boolean;
  monitorColumns: Record<MonitorColumnId, boolean>;
  dynamicMonitorColumns: Record<string, boolean>;
  decodedPreviewColumns: Record<DecodedPreviewColumnId, boolean>;
  setSearch: (search: string) => void;
  setSelectedTraceRowKey: (key: string | null) => void;
  setColumnOrder: (columns: string[]) => void;
  setShowDecodedPreview: (visible: boolean) => void;
  setShowTransmitComposer: (visible: boolean) => void;
  toggleMonitorColumn: (column: MonitorColumnId) => void;
  setDynamicMonitorColumns: (columns: string[]) => void;
  toggleDynamicMonitorColumn: (column: string) => void;
  toggleDecodedPreviewColumn: (column: DecodedPreviewColumnId) => void;
};

const STORAGE_KEY = "cansim.monitor.preferences.v1";

const defaultMonitorColumns: Record<MonitorColumnId, boolean> = {
  line: true,
  time: true,
  iface: true,
  canId: true,
  dir: true,
  len: true,
  mode: true,
  payload: true,
};

const defaultDecodedPreviewColumns: Record<DecodedPreviewColumnId, boolean> = {
  field: true,
  bits: true,
  raw: true,
  value: true,
  meaning: true,
};

const defaultColumnOrder: string[] = ["line", "time", "iface", "canId", "dir", "len", "mode", "payload"];

function loadPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<MonitorPreferencesState>;
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      selectedTraceRowKey: typeof parsed.selectedTraceRowKey === "string" ? parsed.selectedTraceRowKey : undefined,
      columnOrder: Array.isArray(parsed.columnOrder) ? parsed.columnOrder : defaultColumnOrder,
      showDecodedPreview: typeof parsed.showDecodedPreview === "boolean" ? parsed.showDecodedPreview : true,
      showTransmitComposer: typeof parsed.showTransmitComposer === "boolean" ? parsed.showTransmitComposer : true,
      monitorColumns: { ...defaultMonitorColumns, ...parsed.monitorColumns },
      dynamicMonitorColumns: parsed.dynamicMonitorColumns ?? {},
      decodedPreviewColumns: { ...defaultDecodedPreviewColumns, ...parsed.decodedPreviewColumns },
    };
  } catch {
    return {
      search: "",
      selectedTraceRowKey: undefined,
      columnOrder: defaultColumnOrder,
      showDecodedPreview: true,
      showTransmitComposer: true,
      monitorColumns: defaultMonitorColumns,
      dynamicMonitorColumns: {},
      decodedPreviewColumns: defaultDecodedPreviewColumns,
    };
  }
}

function savePreferences(
  state: Pick<
    MonitorPreferencesState,
    | "search"
    | "selectedTraceRowKey"
    | "columnOrder"
    | "showDecodedPreview"
    | "showTransmitComposer"
    | "monitorColumns"
    | "dynamicMonitorColumns"
    | "decodedPreviewColumns"
  >,
) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      search: state.search,
      selectedTraceRowKey: state.selectedTraceRowKey,
      columnOrder: state.columnOrder,
      showDecodedPreview: state.showDecodedPreview,
      showTransmitComposer: state.showTransmitComposer,
      monitorColumns: state.monitorColumns,
      dynamicMonitorColumns: state.dynamicMonitorColumns,
      decodedPreviewColumns: state.decodedPreviewColumns,
    }),
  );
}

const initial = loadPreferences();

export const monitorColumnLabels: Record<MonitorColumnId, string> = {
  line: "Line",
  time: "Time",
  iface: "Iface",
  canId: "CAN ID",
  dir: "Dir",
  len: "Len",
  mode: "Mode",
  payload: "Payload",
};

export const decodedPreviewColumnLabels: Record<DecodedPreviewColumnId, string> = {
  field: "Field",
  bits: "Bits",
  raw: "Raw",
  value: "Value",
  meaning: "Meaning",
};

export const useMonitorPreferencesStore = create<MonitorPreferencesState>((set) => ({
  search: initial.search,
  selectedTraceRowKey: initial.selectedTraceRowKey,
  columnOrder: initial.columnOrder,
  showDecodedPreview: initial.showDecodedPreview,
  showTransmitComposer: initial.showTransmitComposer,
  monitorColumns: initial.monitorColumns,
  dynamicMonitorColumns: initial.dynamicMonitorColumns,
  decodedPreviewColumns: initial.decodedPreviewColumns,

  setSearch: (search) =>
    set((state) => {
      const next = { ...state, search };
      savePreferences(next);
      return { search };
    }),

  setSelectedTraceRowKey: (selectedTraceRowKey) =>
    set((state) => {
      const next = { ...state, selectedTraceRowKey: selectedTraceRowKey ?? undefined };
      savePreferences(next);
      return { selectedTraceRowKey: selectedTraceRowKey ?? undefined };
    }),

  setColumnOrder: (columnOrder) =>
    set((state) => {
      const next = { ...state, columnOrder };
      savePreferences(next);
      return { columnOrder };
    }),

  setShowDecodedPreview: (showDecodedPreview) =>
    set((state) => {
      const next = { ...state, showDecodedPreview };
      savePreferences(next);
      return { showDecodedPreview };
    }),

  setShowTransmitComposer: (showTransmitComposer) =>
    set((state) => {
      const next = { ...state, showTransmitComposer };
      savePreferences(next);
      return { showTransmitComposer };
    }),

  toggleMonitorColumn: (column) =>
    set((state) => {
      const visibleCount = Object.values(state.monitorColumns).filter(Boolean).length;
      if (state.monitorColumns[column] && visibleCount <= 1) return {};

      const monitorColumns = {
        ...state.monitorColumns,
        [column]: !state.monitorColumns[column],
      };
      const next = { ...state, monitorColumns };
      savePreferences(next);
      return { monitorColumns };
    }),

  setDynamicMonitorColumns: (columns) =>
    set((state) => {
      const nextColumns = Object.fromEntries(columns.map((column) => [column, state.dynamicMonitorColumns[column] ?? true]));
      const same =
        Object.keys(nextColumns).length === Object.keys(state.dynamicMonitorColumns).length &&
        Object.entries(nextColumns).every(([column, visible]) => state.dynamicMonitorColumns[column] === visible);
      if (same) return {};

      const next = { ...state, dynamicMonitorColumns: nextColumns };
      savePreferences(next);
      return { dynamicMonitorColumns: nextColumns };
    }),

  toggleDynamicMonitorColumn: (column) =>
    set((state) => {
      const totalVisible =
        Object.values(state.monitorColumns).filter(Boolean).length + Object.values(state.dynamicMonitorColumns).filter(Boolean).length;
      if (state.dynamicMonitorColumns[column] && totalVisible <= 1) return {};

      const dynamicMonitorColumns = {
        ...state.dynamicMonitorColumns,
        [column]: !(state.dynamicMonitorColumns[column] ?? true),
      };
      const next = { ...state, dynamicMonitorColumns };
      savePreferences(next);
      return { dynamicMonitorColumns };
    }),

  toggleDecodedPreviewColumn: (column) =>
    set((state) => {
      const visibleCount = Object.values(state.decodedPreviewColumns).filter(Boolean).length;
      if (state.decodedPreviewColumns[column] && visibleCount <= 1) return {};

      const decodedPreviewColumns = {
        ...state.decodedPreviewColumns,
        [column]: !state.decodedPreviewColumns[column],
      };
      const next = { ...state, decodedPreviewColumns };
      savePreferences(next);
      return { decodedPreviewColumns };
    }),
}));
