import { create } from "zustand";

export type HelpMode = "view" | "edit" | "diff";

interface HelpState {
  searchQuery: string;
  searchResults: HTMLElement[];
  activeIndex: number;

  setSearchQuery: (q: string) => void;
  setSearchResults(r: HTMLElement[]): void;
  setActiveIndex(index: number): void;
  moveActive(delta: number): void;
  clearSearch(): void;
}

export const useHelpStore = create<HelpState>((set) => ({
  searchQuery: "",
  searchResults: [],
  activeIndex: -1,

  setSearchQuery: (q) => set({ searchQuery: q }),

  setSearchResults: (searchResults) =>
    set({
      searchResults,
      activeIndex: searchResults.length ? 0 : -1,
    }),

  setActiveIndex: (activeIndex) => set({ activeIndex }),

  moveActive: (delta) =>
    set((s) => {
      if (!s.searchResults.length) return {};
      const next = (s.activeIndex + delta + s.searchResults.length) % s.searchResults.length;
      return { activeIndex: next };
    }),

  clearSearch: () =>
    set({
      searchQuery: "",
      searchResults: [],
      activeIndex: -1,
    }),
}));
