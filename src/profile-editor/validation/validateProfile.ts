import { CanProfile, ProfileDocument } from "@/profile-editor/model/profile";

// TODO: Extend this later with bit overlap checks, signal collisions, etc.
export function validateProfile(raw: ProfileDocument): string[] {
  const errors: string[] = [];
  if ("schemaVersion" in raw) {
    const canonical = raw as unknown as { meta?: { name?: string }; layouts?: { canId?: { fields?: unknown[] } }; messages?: unknown };
    if (!canonical.meta?.name) errors.push("meta.name is required");
    if (!canonical.layouts?.canId?.fields) errors.push("layouts.canId.fields is required");
    if (!Array.isArray(canonical.messages)) errors.push("messages must be an array");
    return errors;
  }

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
