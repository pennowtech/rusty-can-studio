import { create } from "zustand";

import { normalizeProfile } from "@/profile-editor/normalizeProfile";
import { validateProfile } from "@/profile-editor/validation/validateProfile";
import { CanProfile, ProfileViewMode } from "@/profile-editor/model/profile";
import { ProfileValidationError, validateProfileDraft } from "@/profile-editor/validation/validateProfileDraft";
import { openJsonFile, saveJsonFile } from "../tauriFileIO";
import { toast } from "sonner";

interface ProfileState {
  profile: CanProfile | null;
  draftProfile: CanProfile | null;
  viewMode: ProfileViewMode;

  jsonError?: string;
  validationErrors: ProfileValidationError[];
  hasBlockingErrors: boolean;

  setViewMode: (mode: ProfileViewMode) => void;
  updateDraftProfile: (updater: (draft: CanProfile) => void) => void;

  importJson: () => Promise<void>;
  exportJson: (opts?: { draft?: boolean }) => Promise<void>;
  updateDraftFromJson: (jsonText: string) => void;

  enterEditMode: () => void;
  cancelEdit: () => void;
  applyEdit: () => void;
  clear: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  draftProfile: null,
  viewMode: "visual",
  validationErrors: [],
  hasBlockingErrors: false,

  setViewMode: (mode) => set({ viewMode: mode }),

  updateDraftProfile: (updater) =>
    set((state) => {
      if (!state.draftProfile) return {};

      // structuredClone is available in modern browsers + Tauri
      const next = structuredClone(state.draftProfile);
      updater(next);

      const validationErrors = validateProfileDraft(next);

      return {
        draftProfile: next,
        validationErrors,
        hasBlockingErrors: validationErrors.length > 0,
      };
    }),

  importJson: async () => {
    const jsonText = await openJsonFile();
    if (!jsonText) return;
    try {
      const jsonParsed = JSON.parse(jsonText);
      const errors = validateProfile(jsonParsed);
      if (errors.length > 0) {
        set({ jsonError: errors.join("\n") });
        return;
      }

      const normalized = normalizeProfile(jsonParsed);
      set({
        profile: normalized,
        draftProfile: null,
        viewMode: "visual",
        jsonError: undefined,
        validationErrors: [],
        hasBlockingErrors: false,
      });
    } catch (e: any) {
      toast.error(e.message);
      console.warn("Import profile errors:", e.message);
      set({ jsonError: e.message });
    }
  },

  exportJson: async ({ draft } = {}) => {
    const { profile, draftProfile, viewMode, hasBlockingErrors } = get();

    const targetProfile = draft && viewMode === "edit" && draftProfile ? draftProfile : profile;

    if (!targetProfile) return;

    if (draft && hasBlockingErrors) {
      // TODO: show toast instead
      console.warn("Cannot export invalid draft");
      return;
    }
    const json = JSON.stringify(targetProfile, null, 2);
    await saveJsonFile(json);
  },

  updateDraftFromJson: (jsonText) => {
    try {
      const jsonParsed = JSON.parse(jsonText);
      const errors = validateProfile(jsonParsed);
      if (errors.length > 0) {
        console.log("updateDraftFromJson errors:", errors);
        set({ jsonError: errors.join("\n") });
        return;
      }

      const normalized = normalizeProfile(jsonParsed);

      set({
        draftProfile: normalized,
        jsonError: undefined,
      });
    } catch (e: any) {
      set({ jsonError: e.message });
    }
  },

  enterEditMode: () => {
    const { profile } = get();
    if (!profile) return;

    set({
      draftProfile: structuredClone(profile),
      viewMode: "edit",
      validationErrors: [],
      hasBlockingErrors: false,
    });
  },

  cancelEdit: () =>
    set({
      draftProfile: null,
      viewMode: "visual",
    }),

  applyEdit: () => {
    const { draftProfile, hasBlockingErrors } = get();
    if (!draftProfile || hasBlockingErrors) {
      return;
    }
    const { jsonError } = get();
    if (jsonError !== undefined) return;
    if (!draftProfile) return;

    set({
      profile: draftProfile,
      draftProfile: null,
      viewMode: "visual",
      validationErrors: [],
      hasBlockingErrors: false,
    });
  },

  clear: () => set({ profile: null, jsonError: undefined }),
}));
