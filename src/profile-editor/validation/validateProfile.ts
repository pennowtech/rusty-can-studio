import { ProfileDocument } from "@/profile-editor/model/profile";

export function validateProfile(raw: unknown): string[] {
  const errors: string[] = [];
  const profile = raw as Partial<ProfileDocument>;

  if (profile.schemaVersion !== "1.0") errors.push('schemaVersion must be "1.0"');
  if (!profile.meta?.id) errors.push("meta.id is required");
  if (!profile.meta?.name) errors.push("meta.name is required");
  if (!profile.meta?.version) errors.push("meta.version is required");
  if (!profile.bus?.type) errors.push("bus.type is required");
  if (!profile.bus?.idFormat) errors.push("bus.idFormat is required");
  if (!profile.bus?.byteOrder) errors.push("bus.byteOrder is required");
  if (!profile.layouts?.canId?.fields) errors.push("layouts.canId.fields is required");
  if (!Array.isArray(profile.messages)) errors.push("messages must be an array");

  return errors;
}
