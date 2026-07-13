import { ProfileDocument } from "../model/profile";
import { validateCanIdLayout } from "./validateCanIdLayout";

export interface ProfileValidationError {
  scope: "canIdLayout";
  layoutId: string;
  message: string;
}

export function validateProfileDraft(profile: ProfileDocument): ProfileValidationError[] {
  const errors: ProfileValidationError[] = [];

  if ("schemaVersion" in profile) {
    const canonical = profile as unknown as { layouts: { canId: { label?: string; fields: Array<{ name: string; startBit: number; bitLength: number }> } } };
    const fields = canonical.layouts.canId.fields.map((field) => ({
      name: field.name,
      startBit: field.startBit,
      length: field.bitLength,
    }));
    const overlaps = validateCanIdLayout(fields);
    for (const overlap of overlaps) {
      errors.push({
        scope: "canIdLayout",
        layoutId: canonical.layouts.canId.label ?? "canId",
        message: `${canonical.layouts.canId.label ?? "CAN ID"}: ${overlap.fieldA} overlaps ${overlap.fieldB} at bits ${overlap.overlapRange[0]}-${overlap.overlapRange[1]}`,
      });
    }
    return errors;
  }

  for (const layout of Object.values(profile.canIdLayouts)) {
    const overlaps = validateCanIdLayout(layout.fields);
    for (const overlap of overlaps) {
      errors.push({
        scope: "canIdLayout",
        layoutId: layout.id,
        message: `${layout.name}: ${overlap.fieldA} overlaps ${overlap.fieldB} at bits ${overlap.overlapRange[0]}-${overlap.overlapRange[1]}`,
      });
    }
  }

  return errors;
}
