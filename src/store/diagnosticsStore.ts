import { create } from "zustand";

export type DiagnosticLevel = "info" | "warning" | "error";

export type DiagnosticEntry = {
  id: string;
  time: string;
  level: DiagnosticLevel;
  source: string;
  message: string;
  detail?: string;
};

type DiagnosticsState = {
  entries: DiagnosticEntry[];
  addEntry: (entry: Omit<DiagnosticEntry, "id" | "time">) => void;
  clear: () => void;
};

const STORAGE_KEY = "cansim.diagnostics.v1";
const MAX_ENTRIES = 500;

function loadEntries(): DiagnosticEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as DiagnosticEntry[];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry.id && entry.time && entry.level && entry.source && entry.message) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: DiagnosticEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  entries: loadEntries(),

  addEntry: (entry) =>
    set((state) => {
      const entries = [
        ...state.entries,
        {
          ...entry,
          id: `diag_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          time: new Date().toISOString(),
        },
      ].slice(-MAX_ENTRIES);
      saveEntries(entries);
      return { entries };
    }),

  clear: () =>
    set(() => {
      saveEntries([]);
      return { entries: [] };
    }),
}));

export function logDiagnostic(entry: Omit<DiagnosticEntry, "id" | "time">) {
  useDiagnosticsStore.getState().addEntry(entry);
}
