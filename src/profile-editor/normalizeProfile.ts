// This:
// - Applies defaults
// - Ensures arrays/objects exist
// - Makes editor safe

import { CanProfile } from "./model/profile";

export function normalizeProfile(raw: CanProfile): CanProfile {
  return {
    meta: {
      name: raw.meta?.name ?? "Unnamed Profile",
      version: raw.meta?.version,
      description: raw.meta?.description,
    },

    canIdLayouts: raw.canIdLayouts ?? {},

    frames: raw.frames ?? {},

    fieldTypes: raw.fieldTypes ?? {},

    derivedFields: Array.isArray(raw.derivedFields) ? raw.derivedFields : [],

    columns: Array.isArray(raw.columns) ? raw.columns : [],
  };
}
