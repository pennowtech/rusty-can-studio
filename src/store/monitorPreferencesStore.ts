import { create } from "zustand";
import type { PayloadDisplayMode } from "@sbt/desktop-kit/components/PayloadFieldsCell";

export type MonitorColumnId = "line" | "time" | "iface" | "canId" | "dir" | "len" | "mode" | "payload";
export type FilterDisplayMode = "matches" | "highlight";

export const loadedTracePageSizes = [10, 25, 50, 100, 250, 500, 1000] as const;

type MonitorPreferencesState = {
  search: string;
  filterDisplayMode: FilterDisplayMode;
  selectedTraceRowKey?: string;
  columnOrder: string[];
  loadedPageSize: number;
  loadedPageIndex: number;
  showDecodedPreview: boolean;
  showTransmitComposer: boolean;
  monitorColumns: Record<MonitorColumnId, boolean>;
  // Full = common + variant fields together (matches mqttx-next's own
  // payload view, which has no separate "common" concept exposed in its
  // UI). Variant only = just the variant-specific fields, on the
  // expectation that payload.common fields get pinned as their own
  // columns instead (see fieldColumnsStore.ts) - RustyCAN's default, since
  // profile.payload.common fields are usually exactly what's worth sorting/
  // filtering a trace by.
  payloadDisplayMode: PayloadDisplayMode;
  setSearch: (search: string) => void;
  setFilterDisplayMode: (mode: FilterDisplayMode) => void;
  setSelectedTraceRowKey: (key: string | null) => void;
  setColumnOrder: (columns: string[]) => void;
  setLoadedPageSize: (size: number) => void;
  setLoadedPageIndex: (index: number) => void;
  setShowDecodedPreview: (visible: boolean) => void;
  setShowTransmitComposer: (visible: boolean) => void;
  toggleMonitorColumn: (column: MonitorColumnId) => void;
  setPayloadDisplayMode: (mode: PayloadDisplayMode) => void;
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

const defaultColumnOrder: string[] = ["line", "time", "iface", "canId", "dir", "len", "mode", "payload"];
const defaultLoadedPageSize = 1000;

function normalizePageSize(value: unknown) {
  const numeric = Number(value);
  return loadedTracePageSizes.includes(numeric as (typeof loadedTracePageSizes)[number]) ? numeric : defaultLoadedPageSize;
}

function normalizePageIndex(value: unknown) {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function normalizeFilterDisplayMode(value: unknown): FilterDisplayMode {
  return value === "highlight" ? "highlight" : "matches";
}

function normalizePayloadDisplayMode(value: unknown): PayloadDisplayMode {
  return value === "full" ? "full" : "variantOnly";
}

function loadPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<MonitorPreferencesState>;
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      filterDisplayMode: normalizeFilterDisplayMode(parsed.filterDisplayMode),
      selectedTraceRowKey: typeof parsed.selectedTraceRowKey === "string" ? parsed.selectedTraceRowKey : undefined,
      columnOrder: Array.isArray(parsed.columnOrder) ? parsed.columnOrder : defaultColumnOrder,
      loadedPageSize: normalizePageSize(parsed.loadedPageSize),
      loadedPageIndex: normalizePageIndex(parsed.loadedPageIndex),
      showDecodedPreview: typeof parsed.showDecodedPreview === "boolean" ? parsed.showDecodedPreview : true,
      showTransmitComposer: typeof parsed.showTransmitComposer === "boolean" ? parsed.showTransmitComposer : true,
      monitorColumns: { ...defaultMonitorColumns, ...parsed.monitorColumns },
      payloadDisplayMode: normalizePayloadDisplayMode(parsed.payloadDisplayMode),
    };
  } catch {
    return {
      search: "",
      filterDisplayMode: "matches" as FilterDisplayMode,
      selectedTraceRowKey: undefined,
      columnOrder: defaultColumnOrder,
      loadedPageSize: defaultLoadedPageSize,
      loadedPageIndex: 0,
      showDecodedPreview: true,
      showTransmitComposer: true,
      monitorColumns: defaultMonitorColumns,
      payloadDisplayMode: "variantOnly" as PayloadDisplayMode,
    };
  }
}

function savePreferences(
  state: Pick<
    MonitorPreferencesState,
    | "search"
    | "filterDisplayMode"
    | "selectedTraceRowKey"
    | "columnOrder"
    | "loadedPageSize"
    | "loadedPageIndex"
    | "showDecodedPreview"
    | "showTransmitComposer"
    | "monitorColumns"
    | "payloadDisplayMode"
  >,
) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      search: state.search,
      filterDisplayMode: state.filterDisplayMode,
      selectedTraceRowKey: state.selectedTraceRowKey,
      columnOrder: state.columnOrder,
      loadedPageSize: state.loadedPageSize,
      loadedPageIndex: state.loadedPageIndex,
      showDecodedPreview: state.showDecodedPreview,
      showTransmitComposer: state.showTransmitComposer,
      monitorColumns: state.monitorColumns,
      payloadDisplayMode: state.payloadDisplayMode,
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

export const useMonitorPreferencesStore = create<MonitorPreferencesState>((set) => ({
  search: initial.search,
  filterDisplayMode: initial.filterDisplayMode,
  selectedTraceRowKey: initial.selectedTraceRowKey,
  columnOrder: initial.columnOrder,
  loadedPageSize: initial.loadedPageSize,
  loadedPageIndex: initial.loadedPageIndex,
  showDecodedPreview: initial.showDecodedPreview,
  showTransmitComposer: initial.showTransmitComposer,
  monitorColumns: initial.monitorColumns,
  payloadDisplayMode: initial.payloadDisplayMode,

  setSearch: (search) =>
    set((state) => {
      const next = { ...state, search };
      savePreferences(next);
      return { search };
    }),

  setFilterDisplayMode: (filterDisplayMode) =>
    set((state) => {
      const next = { ...state, filterDisplayMode };
      savePreferences(next);
      return { filterDisplayMode };
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

  setLoadedPageSize: (loadedPageSize) =>
    set((state) => {
      const normalizedSize = normalizePageSize(loadedPageSize);
      const next = { ...state, loadedPageSize: normalizedSize, loadedPageIndex: 0 };
      savePreferences(next);
      return { loadedPageSize: normalizedSize, loadedPageIndex: 0 };
    }),

  setLoadedPageIndex: (loadedPageIndex) =>
    set((state) => {
      const normalizedIndex = normalizePageIndex(loadedPageIndex);
      const next = { ...state, loadedPageIndex: normalizedIndex };
      savePreferences(next);
      return { loadedPageIndex: normalizedIndex };
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

  setPayloadDisplayMode: (payloadDisplayMode) =>
    set((state) => {
      const next = { ...state, payloadDisplayMode };
      savePreferences(next);
      return { payloadDisplayMode };
    }),
}));
