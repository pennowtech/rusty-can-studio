import { create } from "zustand";
import { defaultHelpMarkdown } from "../defaultHelpMarkdown";
import { loadCustomHelp, loadDefaultHelp, resetCustomHelp, saveCustomHelp } from "../utils/helpTextSave";

interface HelpContentState {
  defaultMarkdown: string;
  customMarkdown: string | null;
  isDirty: boolean;
  isSaving: boolean;
  resolvedMarkdown: string;
  loadHelp(): Promise<void>;
  setCustomMarkdown(md: string): void;
  saveCustomMarkdown(): Promise<void>;
  resetToDefaultMarkdown(): Promise<void>;
}

export const useHelpContentStore = create<HelpContentState>((set, get) => ({
  defaultMarkdown: defaultHelpMarkdown,
  customMarkdown: null,
  isDirty: false,
  isSaving: false,
  resolvedMarkdown: defaultHelpMarkdown,

  loadHelp: async () => {
    const [defaultMd, customMd] = await Promise.all([loadDefaultHelp(), loadCustomHelp()]);

    set({
      defaultMarkdown: defaultMd,
      customMarkdown: customMd,
      resolvedMarkdown: customMd ?? defaultMd,
      isDirty: false,
    });
  },

  setCustomMarkdown: (md) => {
    const { defaultMarkdown } = get();
    set({
      customMarkdown: md,
      resolvedMarkdown: md,
      isDirty: md !== defaultMarkdown,
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
    set({
      customMarkdown: null,
      resolvedMarkdown: defaultMd,
      isDirty: false,
    });
  },
}));
