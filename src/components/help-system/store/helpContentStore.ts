import { create } from "zustand";
import { defaultHelpMarkdown } from "../defaultHelpMarkdown";
import { loadCustomHelp, loadDefaultHelp, resetCustomHelp, saveCustomHelp } from "../utils/helpTextSave";
import type { HelpChapter } from "../model/helpChapter";
import { joinHelpChapters, splitHelpMarkdown } from "../utils/helpChapters";

interface HelpContentState {
  defaultMarkdown: string;
  customMarkdown: string | null;
  chapters: HelpChapter[];
  selectedChapterId: string;
  isDirty: boolean;
  isSaving: boolean;
  resolvedMarkdown: string;
  selectedChapterMarkdown: string;
  loadHelp(): Promise<void>;
  setCustomMarkdown(md: string): void;
  selectChapter(id: string): void;
  setSelectedChapterMarkdown(md: string): void;
  saveCustomMarkdown(): Promise<void>;
  resetToDefaultMarkdown(): Promise<void>;
  resetSelectedChapter(): Promise<void>;
}

export const useHelpContentStore = create<HelpContentState>((set, get) => ({
  defaultMarkdown: defaultHelpMarkdown,
  customMarkdown: null,
  chapters: splitHelpMarkdown(defaultHelpMarkdown),
  selectedChapterId: splitHelpMarkdown(defaultHelpMarkdown)[0]?.id ?? "overview-0",
  isDirty: false,
  isSaving: false,
  resolvedMarkdown: defaultHelpMarkdown,
  selectedChapterMarkdown: splitHelpMarkdown(defaultHelpMarkdown)[0]?.markdown ?? defaultHelpMarkdown,

  loadHelp: async () => {
    const [defaultMd, customMd] = await Promise.all([loadDefaultHelp(), loadCustomHelp()]);
    const resolvedMarkdown = customMd ?? defaultMd;
    const chapters = splitHelpMarkdown(resolvedMarkdown);
    const selectedChapterId = get().selectedChapterId;
    const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0];

    set({
      defaultMarkdown: defaultMd,
      customMarkdown: customMd,
      resolvedMarkdown,
      chapters,
      selectedChapterId: selectedChapter?.id ?? "overview-0",
      selectedChapterMarkdown: selectedChapter?.markdown ?? resolvedMarkdown,
      isDirty: false,
    });
  },

  setCustomMarkdown: (md) => {
    const { defaultMarkdown } = get();
    const chapters = splitHelpMarkdown(md);
    const selectedChapter = chapters.find((chapter) => chapter.id === get().selectedChapterId) ?? chapters[0];
    set({
      customMarkdown: md,
      resolvedMarkdown: md,
      chapters,
      selectedChapterId: selectedChapter?.id ?? "overview-0",
      selectedChapterMarkdown: selectedChapter?.markdown ?? md,
      isDirty: md !== defaultMarkdown,
    });
  },

  selectChapter: (id) => {
    const chapter = get().chapters.find((item) => item.id === id);
    if (!chapter) return;
    set({ selectedChapterId: id, selectedChapterMarkdown: chapter.markdown });
  },

  setSelectedChapterMarkdown: (md) => {
    const { selectedChapterId, chapters, defaultMarkdown } = get();
    const nextChapters = chapters.map((chapter) => (chapter.id === selectedChapterId ? { ...chapter, markdown: md, title: chapter.title } : chapter));
    const nextMarkdown = joinHelpChapters(nextChapters);
    set({
      chapters: nextChapters,
      selectedChapterMarkdown: md,
      customMarkdown: nextMarkdown,
      resolvedMarkdown: nextMarkdown,
      isDirty: nextMarkdown !== defaultMarkdown,
    });
  },

  saveCustomMarkdown: async () => {
    const { customMarkdown } = get();
    if (customMarkdown == null) return;

    set({ isSaving: true });
    try {
      await saveCustomHelp(customMarkdown);
      set({ isDirty: false });
    } finally {
      set({ isSaving: false });
    }
  },

  resetToDefaultMarkdown: async () => {
    await resetCustomHelp();
    const defaultMd = get().defaultMarkdown;
    const chapters = splitHelpMarkdown(defaultMd);
    const selectedChapter = chapters[0];
    set({
      customMarkdown: null,
      resolvedMarkdown: defaultMd,
      chapters,
      selectedChapterId: selectedChapter?.id ?? "overview-0",
      selectedChapterMarkdown: selectedChapter?.markdown ?? defaultMd,
      isDirty: false,
    });
  },

  resetSelectedChapter: async () => {
    const { defaultMarkdown, selectedChapterId, chapters } = get();
    const defaultChapters = splitHelpMarkdown(defaultMarkdown);
    const defaultChapter = defaultChapters.find((chapter) => chapter.id === selectedChapterId);
    if (!defaultChapter) return;
    const nextChapters = chapters.map((chapter) => (chapter.id === selectedChapterId ? defaultChapter : chapter));
    const nextMarkdown = joinHelpChapters(nextChapters);
    set({
      chapters: nextChapters,
      selectedChapterMarkdown: defaultChapter.markdown,
      customMarkdown: nextMarkdown,
      resolvedMarkdown: nextMarkdown,
      isDirty: nextMarkdown !== defaultMarkdown,
    });
  },
}));
