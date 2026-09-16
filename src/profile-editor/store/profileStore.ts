import { create } from "zustand";

import { validateProfile } from "@/profile-editor/validation/validateProfile";
import { ProfileDocument, ProfileViewMode } from "@/profile-editor/model/profile";
import type { CanonicalProfile, CanonicalVariant } from "@/profile-editor/model/canonicalProfile";
import { ProfileValidationError, validateProfileDraft } from "@/profile-editor/validation/validateProfileDraft";
import { openJsonFile, saveJsonFile } from "../tauriFileIO";
import { toast } from "sonner";
import type { WsFrame } from "@/can-bridge/ws/types";
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
    bus: { type: "can-fd", idFormat: "extended", byteOrder: "little" },
    layouts: {
      canId: {
        label: "CAN ID",
        bitLength: 29,
        fields: [{ name: "can_id", label: "CAN ID", startBit: 0, bitLength: 29, type: "uint" }],
      },
    },
    dictionaries: {},
    payload: { discriminator: [], variants: {} },
    errors: [],
    display: {},
  };
}

// A variants entry is either one CanonicalVariant or an array of them (see
// CanonicalProfile.payload.variants doc) — every reader that just wants
// "the variants, flat" goes through this rather than re-deriving the
// Array.isArray check each time.
function flatVariants(profile: ProfileDocument): CanonicalVariant[] {
  return Object.values(profile.payload.variants).flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
}

function firstMessageDefinitionId(profile: ProfileDocument) {
  return flatVariants(profile)[0]?.id;
}

function hasProfileVariants(profile: ProfileDocument | null | undefined) {
  return Boolean(profile && Object.keys(profile.payload.variants).length);
}

// Editing is ambient outside the Full JSON tab — every other surface
// (fields, dictionaries, errors) has its own inline edit affordance, so a
// draft is kept alive automatically whenever a profile is loaded/selected,
// re-committed (applyEdit), or reverted (cancelEdit), instead of requiring
// a separate "Edit" click to unlock the whole profile first.
function draftFrom(profile: ProfileDocument | null) {
  if (!profile) return { draftProfile: null, validationErrors: [], hasBlockingErrors: false };
  const draftProfile = structuredClone(profile);
  const validationErrors = validateProfileDraft(draftProfile);
  return { draftProfile, validationErrors, hasBlockingErrors: validationErrors.length > 0 };
}

// Accepts the terse on-disk shorthand (`{ "ref_file": "k2_common.json" }`
// with no `fields`/`bitLength`) and fills in empty defaults so the rest of
// the app can keep treating CanonicalLayout's `fields`/`bitLength` as
// always-present, never needing to know `ref_file` exists.
function normalizeLayout<T extends { fields?: unknown; bitLength?: unknown } | undefined>(layout: T): T {
  if (!layout || typeof layout !== "object") return layout;
  const withDefaults = layout as { fields?: unknown; bitLength?: unknown };
  withDefaults.fields ??= [];
  withDefaults.bitLength ??= 0;
  return layout;
}

// The inverse of normalizeLayout, applied only when actually writing a
// profile out (exportJson, "Save JSON") — a ref_file layout is saved as
// just `{ "ref_file": "..." }`, never the internal fields/bitLength
// placeholders (or anything that ended up in them by mistake; ref_file
// always wins). Keeps saved files exactly as small as what the user
// actually authored, regardless of what the app's own in-memory
// representation carries for its own bookkeeping.
function denormalizeLayout<T extends { ref_file?: string } | undefined>(layout: T): T {
  if (!layout || typeof layout !== "object" || !layout.ref_file) return layout;
  return { ref_file: layout.ref_file } as T;
}

// Mirrors normalizeProfileLayouts's flat-shape acceptance: saves `canId` as
// a top-level sibling of `meta`/`bus`, not nested under `layouts` — the
// internal representation stays nested (touching that would ripple through
// every reader in the app for no benefit), but the file on disk is the
// simpler shape regardless of which shape it was loaded from.
export function denormalizeProfileForExport(profile: ProfileDocument): Record<string, unknown> {
  const clone = structuredClone(profile);
  const canId = denormalizeLayout(clone.layouts.canId);
  const common = denormalizeLayout(clone.payload.common);
  const { layouts: _layouts, payload, schemaVersion, meta, bus, dictionaries, errors, display, ...rest } = clone;
  return { schemaVersion, meta, bus, canId, payload: { ...payload, common }, dictionaries, errors, display, ...rest };
}

function normalizeProfileLayouts(profile: any) {
  if (!profile.layouts && profile.canId) {
    profile.layouts = { canId: profile.canId };
    delete profile.canId;
  }
  normalizeLayout(profile.layouts?.canId);
  profile.payload ??= {};
  normalizeLayout(profile.payload.common);
  profile.payload.discriminator ??= [];
  profile.payload.variants ??= {};
  return profile as ProfileDocument;
}

function parseProfileJson(jsonText: string) {
  const parsed = normalizeProfileLayouts(JSON.parse(jsonText));
  const errors = validateProfile(parsed);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return parsed as ProfileDocument;
}

function baseName(path: string) {
  return path.split(/[/\\]/).pop() ?? path;
}

// Index into `loadedProfiles` of the loaded profile whose own source
// filename matches `refFile` (basename, case-insensitive) — how `ref_file`
// resolves, working identically in the browser and the desktop app since
// it only looks at what's already loaded, never touches the filesystem.
// Returns null when nothing loaded matches.
export function findLoadedProfileByFile(refFile: string, loadedProfiles: ProfileDocument[], fileNames: (string | null)[]): number | null {
  const target = baseName(refFile).toLowerCase();
  const index = fileNames.findIndex((name) => name && baseName(name).toLowerCase() === target);
  return index >= 0 && index < loadedProfiles.length ? index : null;
}

// What a profile's CAN-ID layout / payload common layout actually resolves
// from, for the "Referenced from ..." banner in the CAN ID layout and
// Payload common tabs. `donorIndex` is null when `ref_file` is set but
// isn't currently resolvable (nothing loaded matches that filename).
export type LayoutSource = { kind: "own" } | { kind: "ref"; refFile: string; donorIndex: number | null };

function describeLayoutSource(
  layout: { ref_file?: string } | undefined,
  loadedProfiles: ProfileDocument[],
  fileNames: (string | null)[],
): LayoutSource {
  if (!layout?.ref_file) return { kind: "own" };
  return { kind: "ref", refFile: layout.ref_file, donorIndex: findLoadedProfileByFile(layout.ref_file, loadedProfiles, fileNames) };
}

export function describeCanIdSource(profile: ProfileDocument, loadedProfiles: ProfileDocument[], fileNames: (string | null)[]): LayoutSource {
  return describeLayoutSource(profile.layouts.canId, loadedProfiles, fileNames);
}

export function describePayloadCommonSource(profile: ProfileDocument, loadedProfiles: ProfileDocument[], fileNames: (string | null)[]): LayoutSource {
  return describeLayoutSource(profile.payload.common, loadedProfiles, fileNames);
}

// Surfaces an unresolved `ref_file` loudly (toast + diagnostics log)
// instead of the profile silently resolving to an empty layout. Called
// from the store's own load/select actions (never from
// resolveProfileReferences itself, which runs inside render-path
// useMemo — a toast side effect there would fire repeatedly / during
// React's render).
function warnUnresolvedRefs(profile: ProfileDocument, loadedProfiles: ProfileDocument[], fileNames: (string | null)[]) {
  const canIdSource = describeCanIdSource(profile, loadedProfiles, fileNames);
  if (canIdSource.kind === "ref" && canIdSource.donorIndex == null) {
    const message = `"${profile.meta.name}" references "${canIdSource.refFile}" for its CAN ID layout, but that file isn't currently loaded.`;
    toast.error(message);
    logDiagnostic({ level: "error", source: "Profile", message: "Unresolved CAN ID layout ref_file", detail: message });
  }
  const payloadCommonSource = describePayloadCommonSource(profile, loadedProfiles, fileNames);
  if (payloadCommonSource.kind === "ref" && payloadCommonSource.donorIndex == null) {
    const message = `"${profile.meta.name}" references "${payloadCommonSource.refFile}" for its payload common fields, but that file isn't currently loaded.`;
    toast.error(message);
    logDiagnostic({ level: "error", source: "Profile", message: "Unresolved payload common ref_file", detail: message });
  }
}

export function resolveProfileReferences(profile: ProfileDocument | null): ProfileDocument | null {
  if (!profile) return null;

  try {
    const state = useProfileStore.getState();
    const loadedProfiles = state.loadedProfiles;
    const fileNames = state.loadedProfileFileNames;

    // Create a resolved copy of the profile
    const resolved = structuredClone(profile);

    // Merge dictionaries from other loaded profiles
    resolved.dictionaries ??= {};
    for (const loaded of loadedProfiles) {
      if (loaded.meta.id === resolved.meta.id) continue;
      if (loaded.dictionaries) {
        for (const [key, dict] of Object.entries(loaded.dictionaries)) {
          if (!resolved.dictionaries[key]) {
            resolved.dictionaries[key] = dict;
          }
        }
      }
    }

    // Merge errors from other loaded profiles
    resolved.errors ??= [];
    for (const loaded of loadedProfiles) {
      if (loaded.meta.id === resolved.meta.id) continue;
      if (loaded.errors) {
        for (const error of loaded.errors) {
          if (!resolved.errors.some(e => e.id === error.id)) {
            resolved.errors.push(error);
          }
        }
      }
    }

    // Resolve the CAN-ID layout / payload common layout from another
    // loaded profile when this one points at one (`ref_file`) or doesn't
    // define its own — see describeCanIdSource/describePayloadCommonSource.
    const canIdSource = describeCanIdSource(resolved, loadedProfiles, fileNames);
    if (canIdSource.kind !== "own" && canIdSource.donorIndex != null) {
      resolved.layouts.canId = structuredClone(loadedProfiles[canIdSource.donorIndex].layouts.canId);
    }
    const payloadCommonSource = describePayloadCommonSource(resolved, loadedProfiles, fileNames);
    if (payloadCommonSource.kind !== "own" && payloadCommonSource.donorIndex != null && resolved.payload.common) {
      resolved.payload.common = structuredClone(loadedProfiles[payloadCommonSource.donorIndex].payload.common);
    }

    return resolved;
  } catch {
    return profile;
  }
}

interface ProfileState {
  profile: ProfileDocument | null;
  loadedProfiles: ProfileDocument[];
  // Index-aligned with loadedProfiles — the filename each was loaded
  // from, when known (null for profiles created in-app, e.g. "New
  // Profile" or a frame-derived draft). Used to resolve `ref_file`.
  loadedProfileFileNames: (string | null)[];
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
  importJsonText: (jsonText: string, fileName?: string | null) => void;
  importJsonTexts: (jsonTexts: string[], fileNames?: (string | null)[]) => void;
  exportJson: (opts?: { draft?: boolean }) => Promise<void>;
  updateDraftFromJson: (jsonText: string) => void;
  selectLoadedProfile: (index: number) => void;
  unloadLoadedProfile: (index: number) => void;
  addNewProfile: (profile?: CanonicalProfile) => void;

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
  loadedProfileFileNames: [],
  activeProfileIndex: -1,
  draftProfile: null,
  viewMode: "json",
  validationErrors: [],
  hasBlockingErrors: false,

  setViewMode: (mode) => set({ viewMode: mode }),

  updateDraftProfile: (updater) =>
    set((state) => {
      if (!state.draftProfile) return {};
      const next = structuredClone(state.draftProfile);
      updater(next);
      const validationErrors = validateProfileDraft(next);
      return { draftProfile: next, validationErrors, hasBlockingErrors: validationErrors.length > 0 };
    }),

  importJson: async () => {
    try {
      const opened = await openJsonFile();
      if (!opened) return;
      get().importJsonText(opened.text, baseName(opened.path));
    } catch (e: any) {
      toast.error(e.message);
      logDiagnostic({ level: "error", source: "Profile", message: "Profile import failed", detail: e.message });
      set({ jsonError: e.message });
    }
  },

  importJsonText: (jsonText, fileName = null) => {
    try {
      const importedProfile = parseProfileJson(jsonText);
      const loadedProfiles = [...get().loadedProfiles, importedProfile];
      const loadedProfileFileNames = [...get().loadedProfileFileNames, fileName];
      warnUnresolvedRefs(importedProfile, loadedProfiles, loadedProfileFileNames);
      if (get().profile && (hasProfileVariants(get().profile) || !hasProfileVariants(importedProfile))) {
        set({ loadedProfiles, loadedProfileFileNames, jsonError: undefined });
        return;
      }

      set({
        profile: importedProfile,
        loadedProfiles,
        loadedProfileFileNames,
        activeProfileIndex: loadedProfiles.length - 1,
        viewMode: "json",
        selectedFrameKey: undefined,
        selectedMessageDefinitionId: firstMessageDefinitionId(importedProfile),
        selectedFramePayloadHex: undefined,
        jsonError: undefined,
        ...draftFrom(importedProfile),
      });
    } catch (e: any) {
      set({ jsonError: e.message });
      toast.error(e.message);
      logDiagnostic({ level: "error", source: "Profile", message: "Profile JSON parse failed", detail: e.message });
    }
  },

  importJsonTexts: (jsonTexts, fileNames) => {
    try {
      const imported = jsonTexts.map(parseProfileJson);
      if (!imported.length) return;
      const importedNames = jsonTexts.map((_, index) => fileNames?.[index] ?? null);
      const previous = get();
      const firstImportedIndex = previous.loadedProfiles.length;
      const loadedProfiles = [...previous.loadedProfiles, ...imported];
      const loadedProfileFileNames = [...previous.loadedProfileFileNames, ...importedNames];
      for (const importedProfile of imported) warnUnresolvedRefs(importedProfile, loadedProfiles, loadedProfileFileNames);
      if (previous.profile && (hasProfileVariants(previous.profile) || !imported.some(hasProfileVariants))) {
        set({ loadedProfiles, loadedProfileFileNames, jsonError: undefined, validationErrors: [], hasBlockingErrors: false });
        return;
      }

      const activeProfileIndex = loadedProfiles.findIndex((profile, index) => index >= firstImportedIndex && hasProfileVariants(profile));
      const selectedIndex = activeProfileIndex >= 0 ? activeProfileIndex : firstImportedIndex;
      const profile = loadedProfiles[selectedIndex];
      set({
        loadedProfiles,
        loadedProfileFileNames,
        activeProfileIndex: selectedIndex,
        profile,
        viewMode: "json",
        selectedFrameKey: undefined,
        selectedMessageDefinitionId: firstMessageDefinitionId(profile),
        selectedFramePayloadHex: undefined,
        jsonError: undefined,
        ...draftFrom(profile),
      });
    } catch (e: any) {
      set({ jsonError: e.message });
      logDiagnostic({ level: "error", source: "Profile", message: "Profile validation failed", detail: e.message });
    }
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
    await saveJsonFile(JSON.stringify(denormalizeProfileForExport(targetProfile), null, 2));
  },

  updateDraftFromJson: (jsonText) => {
    try {
      const profile = parseProfileJson(jsonText);
      const validationErrors = validateProfileDraft(profile);
      set({ draftProfile: profile, jsonError: undefined, validationErrors, hasBlockingErrors: validationErrors.length > 0 });
    } catch (e: any) {
      set({ jsonError: e.message });
      logDiagnostic({ level: "error", source: "Profile", message: "Profile JSON parse failed", detail: e.message });
    }
  },

  editFrameFromTrace: (frame) => {
    const frameKey = formatFrameKey(frame.id);
    const next = structuredClone(get().draftProfile ?? get().profile ?? createEmptyProfile());
    const length = payloadLength(frame.data_hex);
    next.bus.idFormat = frame.id > 0x7ff ? "extended" : "standard";
    // A ref_file-based canId isn't owned by this profile — leave its
    // layout alone (the variant key below still identifies the message
    // correctly without a local canId field).
    if (!next.layouts.canId.ref_file) {
      next.layouts.canId.bitLength = Math.max(next.layouts.canId.bitLength, frame.id > 0x7ff ? 29 : 11);
      if (!next.layouts.canId.fields.some((field) => field.name === "can_id")) {
        next.layouts.canId.fields.unshift({ name: "can_id", label: "CAN ID", startBit: 0, bitLength: next.layouts.canId.bitLength, type: "uint" });
      }
    }
    if (!next.payload.discriminator.length) next.payload.discriminator = ["can_id"];
    // Keyed by the raw CAN ID directly (not run through the profile's own
    // discriminator, which may name other fields for a real device
    // profile) — this flow is the ad-hoc "stub out a message from whatever
    // frame is selected" path, same simple can_id-only identity the old
    // identifyBy: { can_id: frame.id } shape used.
    const key = String(frame.id);
    const existingEntry = next.payload.variants[key];
    const existing = Array.isArray(existingEntry) ? existingEntry[0] : existingEntry;
    if (!existing) {
      next.payload.variants[key] = {
        id: frameKey,
        label: frameKey,
        description: "Created from selected trace frame.",
        payload: {
          bitLength: length * 8,
          fields: [{ name: "RawValue", startBit: 0, bitLength: Math.min(length * 8, 16), type: "uint" }],
        },
      };
    } else {
      existing.payload.bitLength = Math.max(existing.payload.bitLength, length * 8);
    }

    const validationErrors = validateProfileDraft(next);
    set({
      profile: get().profile ?? next,
      draftProfile: next,
      viewMode: "edit",
      selectedFrameKey: undefined,
      selectedMessageDefinitionId: frameKey,
      selectedFramePayloadHex: frame.data_hex,
      validationErrors,
      hasBlockingErrors: validationErrors.length > 0,
      jsonError: undefined,
    });
  },

  selectFrame: (frameKey, payloadHex) =>
    set({ selectedFrameKey: frameKey, selectedMessageDefinitionId: undefined, selectedFramePayloadHex: payloadHex ?? get().selectedFramePayloadHex }),

  selectMessageDefinition: (id, payloadHex) =>
    set({ selectedMessageDefinitionId: id, selectedFrameKey: undefined, selectedFramePayloadHex: payloadHex ?? get().selectedFramePayloadHex }),

  cancelEdit: () =>
    set((state) => {
      const revertedProfile = state.profile === state.draftProfile ? null : state.profile;
      return { profile: revertedProfile, jsonError: undefined, ...draftFrom(revertedProfile) };
    }),

  applyEdit: () => {
    const { draftProfile, hasBlockingErrors, jsonError } = get();
    if (!draftProfile || hasBlockingErrors || jsonError !== undefined) return;
    set({
      profile: draftProfile,
      loadedProfiles: get().loadedProfiles.map((item, index) => (index === get().activeProfileIndex ? draftProfile : item)),
      jsonError: undefined,
      ...draftFrom(draftProfile),
    });
  },

  selectLoadedProfile: (index) =>
    set((state) => {
      const profile = state.loadedProfiles[index];
      if (!profile) return {};
      warnUnresolvedRefs(profile, state.loadedProfiles, state.loadedProfileFileNames);
      return {
        profile,
        activeProfileIndex: index,
        // Switching which loaded profile you're viewing shouldn't jump you
        // back to the Messages tab or pop a message drawer open — leave
        // selectedMessageDefinitionId alone (unlike import, where landing
        // on the first message is a reasonable default for a profile
        // you've never seen before).
        selectedFrameKey: undefined,
        selectedFramePayloadHex: undefined,
        jsonError: undefined,
        ...draftFrom(profile),
      };
    }),

  unloadLoadedProfile: (index) =>
    set((state) => {
      const loadedProfiles = state.loadedProfiles.filter((_, itemIndex) => itemIndex !== index);
      const loadedProfileFileNames = state.loadedProfileFileNames.filter((_, itemIndex) => itemIndex !== index);
      const activeProfileIndex = loadedProfiles.length ? Math.min(index, loadedProfiles.length - 1) : -1;
      const profile = activeProfileIndex >= 0 ? loadedProfiles[activeProfileIndex] : null;
      return {
        loadedProfiles,
        loadedProfileFileNames,
        activeProfileIndex,
        profile,
        selectedFrameKey: undefined,
        selectedMessageDefinitionId: profile ? firstMessageDefinitionId(profile) : undefined,
        selectedFramePayloadHex: undefined,
        ...draftFrom(profile),
      };
    }),

  addNewProfile: (profile) => {
    const newProfile = (profile ?? createEmptyProfile()) as ProfileDocument;
    const loadedProfiles = [...get().loadedProfiles, newProfile];
    const loadedProfileFileNames = [...get().loadedProfileFileNames, null];
    set({
      loadedProfiles,
      loadedProfileFileNames,
      activeProfileIndex: loadedProfiles.length - 1,
      profile: newProfile,
      viewMode: "edit",
      selectedFrameKey: undefined,
      selectedMessageDefinitionId: firstMessageDefinitionId(newProfile),
      selectedFramePayloadHex: undefined,
      jsonError: undefined,
      ...draftFrom(newProfile),
    });
  },

  clear: () => set({ profile: null, loadedProfiles: [], loadedProfileFileNames: [], activeProfileIndex: -1, draftProfile: null, viewMode: "json", jsonError: undefined }),
}));
