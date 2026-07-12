import { CanProfile } from "@/profile-editor/model/profile";

// TODO: Extend this later with bit overlap checks, signal collisions, etc.
export function validateProfile(raw: CanProfile): string[] {
  const errors: string[] = [];
  const rawProfile = raw as CanProfile & {
    service?: unknown;
    payloadHeader?: unknown;
    attributes?: unknown;
    canIdLayoutRef?: unknown;
  };
  const compactSchemaProfile = Boolean(rawProfile.service && rawProfile.payloadHeader && Array.isArray(rawProfile.attributes));

  if (!raw.meta?.name) {
    errors.push("meta.name is required");
  }

  if (!compactSchemaProfile && !raw.messageSchema && (!raw.canIdLayouts || typeof raw.canIdLayouts !== "object")) {
    errors.push("canIdLayouts must be an object when messageSchema is not defined");
  }

  if (!compactSchemaProfile && !raw.messageSchema && (!raw.frames || typeof raw.frames !== "object")) {
    errors.push("frames must be an object when messageSchema is not defined");
  }

  return errors;
}
