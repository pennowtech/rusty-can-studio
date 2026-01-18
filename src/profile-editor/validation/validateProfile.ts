import { CanProfile } from "@/profile-editor/model/profile";

// TODO: Extend this later with bit overlap checks, signal collisions, etc.
export function validateProfile(raw: CanProfile): string[] {
  const errors: string[] = [];

  if (!raw.meta?.name) {
    errors.push("meta.name is required");
  }

  if (!raw.canIdLayouts || typeof raw.canIdLayouts !== "object") {
    errors.push("canIdLayouts must be an object");
  }

  if (!raw.frames || typeof raw.frames !== "object") {
    errors.push("frames must be an object");
  }

  return errors;
}
