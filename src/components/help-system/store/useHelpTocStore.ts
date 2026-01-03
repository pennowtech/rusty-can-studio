// help/useHelpTocStore.ts
import { create } from "zustand";

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TocState {
  toc: TocItem[];
  activeId: string | null;

  setActiveId(id: string): void;
  setToc(items: TocItem[]): void;
  scrollTo(id: string): void;
}

export const useHelpTocStore = create<TocState>((set) => ({
  toc: [],
  activeId: null,
  setActiveId: (id) => set({ activeId: id }),
  setToc: (items) => set({ toc: items }),
  scrollTo: (id) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  },
}));
