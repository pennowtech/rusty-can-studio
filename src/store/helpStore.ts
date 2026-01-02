import { create } from "zustand";

export type HelpMode = "view" | "edit" | "diff";

interface HelpState {
  isOpen: boolean;
  content: string;
  originalContent: string;
  showPreview: boolean;
  mode: HelpMode;
  searchQuery: string;
  isDirty: boolean;

  openHelp(open: boolean): void;
  setContent: (v: string) => void;
  setOriginal: (v: string) => void;
  togglePreview: () => void;
  setMode: (m: HelpMode) => void;
  setSearchQuery: (q: string) => void;
  reset: () => void;
}

export const useHelpStore = create<HelpState>((set, get) => ({
  isOpen: false,
  content: "",
  originalContent: "",
  showPreview: true,
  mode: "view",
  searchQuery: "",
  isDirty: false,

  openHelp: (open) => set({ isOpen: open }),
  setContent: (v) =>
    set({
      content: v,
      isDirty: v !== get().originalContent,
    }),

  setOriginal: (v) =>
    set({
      content: v,
      originalContent: v,
      isDirty: false,
    }),

  togglePreview: () => set((s) => ({ showPreview: !s.showPreview })),

  setMode: (m) => set({ mode: m }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  reset: () =>
    set((s) => ({
      content: s.originalContent,
      isDirty: false,
    })),
}));
