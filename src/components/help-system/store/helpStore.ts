import { create } from "zustand";
import { useHelpContentStore } from "../store/helpContentStore";

export type HelpMode = "view" | "edit" | "diff";

interface HelpState {
  mode: HelpMode;
  setMode: (mode: HelpMode) => void;

  searchQuery: string;
  searchResults: HTMLElement[];
  activeIndex: number;

  setSearchQuery: (q: string) => void;
  setSearchResults(r: HTMLElement[]): void;
  setActiveIndex(index: number): void;
  moveActive(delta: number): void;
  clearSearch(): void;

  showPreview: boolean;
  togglePreview(): void;
}

export const useHelpStore = create<HelpState>((set, get) => ({
  mode: "view",
  setMode: (mode) => set({ mode }),

  showPreview: true,
  searchQuery: "",
  searchResults: [],
  activeIndex: -1,

  togglePreview: () => set((s) => ({ showPreview: !s.showPreview })),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setSearchResults: (searchResults) =>
    set({
      searchResults,
      activeIndex: searchResults.length ? 0 : -1,
    }),

  setActiveIndex: (activeIndex) => set({ activeIndex }),

  moveActive: (delta) => {
    const { searchResults, activeIndex, searchQuery } = get();
    const { chapters, selectedChapterId, selectChapter } = useHelpContentStore.getState();
    const trimmedQuery = searchQuery.trim().toLowerCase();

    if (searchResults.length > 0) {
      if (delta === 1 && activeIndex === searchResults.length - 1 && trimmedQuery) {
        const currentIndex = chapters.findIndex((c) => c.id === selectedChapterId);
        const matchingChapters = chapters.filter((c) =>
          c.markdown.toLowerCase().includes(trimmedQuery) || c.title.toLowerCase().includes(trimmedQuery)
        );
        if (matchingChapters.length > 0) {
          const nextChapter = matchingChapters.find((c) => chapters.findIndex((item) => item.id === c.id) > currentIndex);
          const targetChapter = nextChapter ?? matchingChapters[0];
          if (targetChapter.id !== selectedChapterId) {
            selectChapter(targetChapter.id);
            return;
          }
        }
      } else if (delta === -1 && activeIndex === 0 && trimmedQuery) {
        const currentIndex = chapters.findIndex((c) => c.id === selectedChapterId);
        const matchingChapters = chapters.filter((c) =>
          c.markdown.toLowerCase().includes(trimmedQuery) || c.title.toLowerCase().includes(trimmedQuery)
        );
        if (matchingChapters.length > 0) {
          const prevChapters = matchingChapters.filter((c) => chapters.findIndex((item) => item.id === c.id) < currentIndex);
          const prevChapter = prevChapters[prevChapters.length - 1];
          const targetChapter = prevChapter ?? matchingChapters[matchingChapters.length - 1];
          if (targetChapter.id !== selectedChapterId) {
            selectChapter(targetChapter.id);
            return;
          }
        }
      }
    }

    if (!searchResults.length) {
      if (trimmedQuery && chapters.length > 0) {
        const firstMatchingChapter = chapters.find((c) =>
          c.markdown.toLowerCase().includes(trimmedQuery) || c.title.toLowerCase().includes(trimmedQuery)
        );
        if (firstMatchingChapter && firstMatchingChapter.id !== selectedChapterId) {
          selectChapter(firstMatchingChapter.id);
          return;
        }
      }
      return;
    }

    const next = (activeIndex + delta + searchResults.length) % searchResults.length;
    set({ activeIndex: next });
  },

  clearSearch: () =>
    set({
      searchQuery: "",
      searchResults: [],
      activeIndex: -1,
    }),
}));
