import { create } from "zustand";

import { normalizeProfile } from "@/profile-editor/normalizeProfile";
import { normalizeToCanonicalProfile } from "@/profile-editor/canonical/normalizeToCanonicalProfile";
import { validateProfile } from "@/profile-editor/validation/validateProfile";
import { CanProfile, ProfileDocument, ProfileViewMode } from "@/profile-editor/model/profile";
import type { CanonicalProfile } from "@/profile-editor/model/canonicalProfile";
import { ProfileValidationError, validateProfileDraft } from "@/profile-editor/validation/validateProfileDraft";
import { openJsonFile, saveJsonFile } from "../tauriFileIO";
import { toast } from "sonner";
import type { WsFrame } from "@/can-bridge/ws/types";
import { getProfileCanIdLayoutRef, getProfileMessageSchema, hasProfileMessages } from "@/profile-editor/profileAdapter";
import { logDiagnostic } from "@/store/diagnosticsStore";

function formatFrameKey(id: number) {
  return `MSG_${id.toString(16).toUpperCase().padStart(id > 0x7ff ? 8 : 3, "0")}`;
}

function payloadLength(dataHex: string) {
  return Math.max(1, Math.floor(dataHex.replace(/[^0-9a-fA-F]/g, "").length / 2));
}

function createEmptyProfile(): CanonicalProfile {
  return {
    schemaVersion: "1.0",
    meta: {
      id: "can_fd_message_profile",
      name: "CAN-FD Message Profile",
      version: "1.0.0",
      description: "Message structures created from live CAN trace frames.",
    },
    bus: {
      type: "can-fd",
      idFormat: "extended",
      byteOrder: "little",
    },
    layouts: {
      canId: {
        label: "CAN ID",
        bitLength: 29,
        fields: [{ name: "can_id", label: "CAN ID", startBit: 0, bitLength: 29, type: "uint" }],
      },
    },
    dictionaries: {},
    messages: [],
    errors: [],
    display: {},
  };
}

function canonicalizeProfile(profile: unknown): CanProfile {
  if (profile && typeof profile === "object" && (profile as { schemaVersion?: unknown }).schemaVersion === "1.0") {
    return profile as unknown as CanProfile;
  }
  return normalizeToCanonicalProfile(normalizeProfile(profile as CanProfile)) as unknown as CanProfile;
}

function firstFrameKey(_profile: ProfileDocument) {
  return undefined;
}

function firstMessageDefinitionId(profile: ProfileDocument) {
  return "messages" in profile ? (profile as unknown as CanonicalProfile).messages[0]?.id : getProfileMessageSchema(profile)?.messageDefinitions?.[0]?.id;
}

export function resolveProfileReferences(profile: ProfileDocument | null, library: ProfileDocument[]): ProfileDocument | null {
  if (!profile) return null;
  if ("schemaVersion" in profile) return profile;

  const canIdLayoutRef = getProfileCanIdLayoutRef(profile);
  if (!canIdLayoutRef) return profile;

  const localLayout = profile.canIdLayouts?.[canIdLayoutRef];
  const schema = getProfileMessageSchema(profile);
  if (schema?.canIdLayout && localLayout) return profile;

  const externalLayout = library.find((candidate) => candidate.canIdLayouts?.[canIdLayoutRef])?.canIdLayouts[canIdLayoutRef];
  const schemaLayout =
    schema?.canIdLayout ??
    (localLayout
      ? {
          bitLength: localLayout.bitLength,
          fields: localLayout.fields,
        }
      : externalLayout
        ? {
            bitLength: externalLayout.bitLength,
            fields: externalLayout.fields,
          }
        : undefined);

  if (!schemaLayout && !externalLayout) return profile;

  const resolved = structuredClone(profile);
  resolved.canIdLayouts = {
    ...resolved.canIdLayouts,
    ...(externalLayout ? { [canIdLayoutRef]: externalLayout } : {}),
  };
  if (resolved.messageSchema && schemaLayout) {
    resolved.messageSchema.canIdLayout = schemaLayout;
  }
  return resolved;
}

interface ProfileState {
  profile: ProfileDocument | null;
  loadedProfiles: ProfileDocument[];
  activeProfileIndex: number;
  draftProfile: ProfileDocument | null;
  viewMode: ProfileViewMode;
  selectedFrameKey?: string;
  selectedMessageDefinitionId?: string;
  selectedFramePayloadHex?: string;

  jsonError?: string;
  validationErrors: ProfileValidationError[];
  hasBlockingErrors: boolean;

  setViewMode: (mode: ProfileViewMode) => void;
  updateDraftProfile: (updater: (draft: ProfileDocument) => void) => void;

  importJson: () => Promise<void>;
  importJsonText: (jsonText: string) => void;
  importJsonTexts: (jsonTexts: string[]) => void;
  exportJson: (opts?: { draft?: boolean }) => Promise<void>;
  updateDraftFromJson: (jsonText: string) => void;
  selectLoadedProfile: (index: number) => void;
  unloadLoadedProfile: (index: number) => void;

  enterEditMode: () => void;
  editFrameFromTrace: (frame: WsFrame) => void;
  selectFrame: (frameKey: string, payloadHex?: string) => void;
  selectMessageDefinition: (id: string, payloadHex?: string) => void;
  cancelEdit: () => void;
  applyEdit: () => void;
  clear: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  loadedProfiles: [],
  activeProfileIndex: -1,
  draftProfile: null,
  viewMode: "json",
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
    try {
      const jsonText = await openJsonFile();
      if (!jsonText) return;

      get().importJsonText(jsonText);
    } catch (e: any) {
      toast.error(e.message);
      console.warn("Import profile errors:", e.message);
      logDiagnostic({ level: "error", source: "Profile", message: "Profile import failed", detail: e.message });
      set({ jsonError: e.message });
    }
  },

  importJsonText: (jsonText) => {
    try {
      const jsonParsed = JSON.parse(jsonText);
      const errors = validateProfile(jsonParsed);
      if (errors.length > 0) {
        set({ jsonError: errors.join("\n") });
        logDiagnostic({ level: "error", source: "Profile", message: "Profile validation failed", detail: errors.join("\n") });
        return;
      }

      const normalized = canonicalizeProfile(jsonParsed);
      const loadedProfiles = [...get().loadedProfiles, normalized];
      if (get().profile && (hasProfileMessages(get().profile) || !hasProfileMessages(normalized))) {
        set({
          loadedProfiles,
          jsonError: undefined,
        });
        return;
      }

      set({
        profile: normalized,
        loadedProfiles,
        activeProfileIndex: loadedProfiles.length - 1,
        draftProfile: null,
        viewMode: "json",
        selectedFrameKey: firstFrameKey(normalized),
        selectedMessageDefinitionId: firstMessageDefinitionId(normalized),
        selectedFramePayloadHex: undefined,
        jsonError: undefined,
        validationErrors: [],
        hasBlockingErrors: false,
      });
    } catch (e: any) {
      set({ jsonError: e.message });
      toast.error(e.message);
      logDiagnostic({ level: "error", source: "Profile", message: "Profile JSON parse failed", detail: e.message });
    }
  },

  importJsonTexts: (jsonTexts) => {
    const imported: ProfileDocument[] = [];
    for (const jsonText of jsonTexts) {
      const jsonParsed = JSON.parse(jsonText);
      const errors = validateProfile(jsonParsed);
      if (errors.length > 0) {
        set({ jsonError: errors.join("\n") });
        logDiagnostic({ level: "error", source: "Profile", message: "Profile validation failed", detail: errors.join("\n") });
        return;
      }
      imported.push(canonicalizeProfile(jsonParsed));
    }
    if (!imported.length) return;
    const previous = get();
    const firstImportedIndex = previous.loadedProfiles.length;
    const loadedProfiles = [...previous.loadedProfiles, ...imported];
    if (previous.profile && (hasProfileMessages(previous.profile) || !imported.some(hasProfileMessages))) {
      set({
        loadedProfiles,
        jsonError: undefined,
        validationErrors: [],
        hasBlockingErrors: false,
      });
      return;
    }

    const activeProfileIndex = loadedProfiles.findIndex((profile, index) => index >= firstImportedIndex && hasProfileMessages(profile));
    const selectedIndex = activeProfileIndex >= 0 ? activeProfileIndex : firstImportedIndex;
    const profile = loadedProfiles[selectedIndex];
    set({
      loadedProfiles,
      activeProfileIndex: selectedIndex,
      profile,
      draftProfile: null,
      viewMode: "json",
      selectedFrameKey: firstFrameKey(profile),
      selectedMessageDefinitionId: firstMessageDefinitionId(profile),
      selectedFramePayloadHex: undefined,
      jsonError: undefined,
      validationErrors: [],
      hasBlockingErrors: false,
    });
  },

  exportJson: async ({ draft } = {}) => {
    const { profile, draftProfile, hasBlockingErrors } = get();

    const targetProfile = draft || draftProfile ? draftProfile ?? profile : profile;

    if (!targetProfile) return;

    if ((draft || draftProfile) && hasBlockingErrors) {
      toast.error("Cannot export profile while draft has validation errors");
      logDiagnostic({ level: "warning", source: "Profile", message: "Profile export blocked by validation errors" });
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
        set({ jsonError: errors.join("\n") });
        logDiagnostic({ level: "error", source: "Profile", message: "Profile validation failed", detail: errors.join("\n") });
        return;
      }

      const normalized = canonicalizeProfile(jsonParsed);
      const validationErrors = validateProfileDraft(normalized);

      set({
        draftProfile: normalized,
        jsonError: undefined,
        validationErrors,
        hasBlockingErrors: validationErrors.length > 0,
      });
    } catch (e: any) {
      set({ jsonError: e.message });
      logDiagnostic({ level: "error", source: "Profile", message: "Profile JSON parse failed", detail: e.message });
    }
  },

  enterEditMode: () => {
    const { profile } = get();
    if (!profile) return;

    set({
      draftProfile: structuredClone(profile),
      validationErrors: [],
      hasBlockingErrors: false,
      jsonError: undefined,
    });
  },

  editFrameFromTrace: (frame) => {
    const frameKey = formatFrameKey(frame.id);
    const current = get().draftProfile ?? get().profile ?? (createEmptyProfile() as unknown as CanProfile);
    const next = structuredClone(current);
    const length = payloadLength(frame.data_hex);

    const canonical = normalizeToCanonicalProfile(next);
    canonical.bus.idFormat = frame.id > 0x7ff ? "extended" : "standard";
    canonical.layouts.canId.bitLength = Math.max(canonical.layouts.canId.bitLength, frame.id > 0x7ff ? 29 : 11);
    if (!canonical.layouts.canId.fields.some((field) => field.name === "can_id")) {
      canonical.layouts.canId.fields.unshift({ name: "can_id", label: "CAN ID", startBit: 0, bitLength: canonical.layouts.canId.bitLength, type: "uint" });
    }
    const existing = canonical.messages.find((message) => message.id === frameKey);
    if (!existing) {
      canonical.messages.push({
        id: frameKey,
        label: frameKey,
        description: "Created from selected trace frame.",
        identifyBy: { can_id: frame.id },
        payload: {
          bitLength: length * 8,
          fields: [{ name: "RawValue", startBit: 0, bitLength: Math.min(length * 8, 16), type: "uint" }],
        },
      });
    } else {
      existing.identifyBy.can_id = frame.id;
      existing.payload.bitLength = Math.max(existing.payload.bitLength, length * 8);
    }

    set({
      profile: get().profile ?? (canonical as unknown as CanProfile),
      draftProfile: canonical as unknown as CanProfile,
      viewMode: "edit",
      selectedFrameKey: undefined,
      selectedMessageDefinitionId: frameKey,
      selectedFramePayloadHex: frame.data_hex,
      validationErrors: validateProfileDraft(canonical as unknown as CanProfile),
      hasBlockingErrors: validateProfileDraft(canonical as unknown as CanProfile).length > 0,
      jsonError: undefined,
    });
  },

  selectFrame: (frameKey, payloadHex) =>
    set({
      selectedFrameKey: frameKey,
      selectedMessageDefinitionId: undefined,
      selectedFramePayloadHex: payloadHex ?? get().selectedFramePayloadHex,
    }),

  selectMessageDefinition: (id, payloadHex) =>
    set({
      selectedMessageDefinitionId: id,
      selectedFrameKey: undefined,
      selectedFramePayloadHex: payloadHex ?? get().selectedFramePayloadHex,
    }),

  cancelEdit: () =>
    set((state) => ({
      profile: state.profile === state.draftProfile ? null : state.profile,
      draftProfile: null,
      validationErrors: [],
      hasBlockingErrors: false,
      jsonError: undefined,
    })),

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
      loadedProfiles: get().loadedProfiles.map((item, index) => (index === get().activeProfileIndex ? draftProfile : item)),
      draftProfile: null,
      validationErrors: [],
      hasBlockingErrors: false,
      jsonError: undefined,
    });
  },

  selectLoadedProfile: (index) =>
    set((state) => {
      const profile = state.loadedProfiles[index];
      if (!profile) return {};
      return {
        profile,
        activeProfileIndex: index,
        draftProfile: null,
        selectedFrameKey: firstFrameKey(profile),
        selectedMessageDefinitionId: profile ? firstMessageDefinitionId(profile) : undefined,
        selectedFramePayloadHex: undefined,
        jsonError: undefined,
        validationErrors: [],
        hasBlockingErrors: false,
      };
    }),

  unloadLoadedProfile: (index) =>
    set((state) => {
      const loadedProfiles = state.loadedProfiles.filter((_, itemIndex) => itemIndex !== index);
      const activeProfileIndex = loadedProfiles.length ? Math.min(index, loadedProfiles.length - 1) : -1;
      const profile = activeProfileIndex >= 0 ? loadedProfiles[activeProfileIndex] : null;
      return {
        loadedProfiles,
        activeProfileIndex,
        profile,
        draftProfile: null,
        selectedFrameKey: profile ? firstFrameKey(profile) : undefined,
        selectedMessageDefinitionId: profile ? firstMessageDefinitionId(profile) : undefined,
        selectedFramePayloadHex: undefined,
      };
    }),

  clear: () => set({ profile: null, loadedProfiles: [], activeProfileIndex: -1, draftProfile: null, viewMode: "json", jsonError: undefined }),
}));
