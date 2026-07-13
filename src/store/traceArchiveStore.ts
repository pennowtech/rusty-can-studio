import { create } from "zustand";

export type TraceArchiveEntry = {
  id: string;
  name: string;
  createdAt: string;
  frameCount: number;
  candumpText: string;
};

type TraceArchiveState = {
  entries: TraceArchiveEntry[];
  addEntry: (entry: Omit<TraceArchiveEntry, "id" | "createdAt">) => void;
  deleteEntry: (id: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "cansim.traceArchive.v1";
const MAX_ENTRIES = 20;

function loadEntries(): TraceArchiveEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as TraceArchiveEntry[];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry.id && entry.name && entry.candumpText) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: TraceArchiveEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export const useTraceArchiveStore = create<TraceArchiveState>((set) => ({
  entries: loadEntries(),

  addEntry: (entry) =>
    set((state) => {
      const entries = [
        {
          ...entry,
          id: `trace_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          createdAt: new Date().toISOString(),
        },
        ...state.entries,
      ].slice(0, MAX_ENTRIES);
      saveEntries(entries);
      return { entries };
    }),

  deleteEntry: (id) =>
    set((state) => {
      const entries = state.entries.filter((entry) => entry.id !== id);
      saveEntries(entries);
      return { entries };
    }),

  clear: () =>
    set(() => {
      saveEntries([]);
      return { entries: [] };
    }),
}));
