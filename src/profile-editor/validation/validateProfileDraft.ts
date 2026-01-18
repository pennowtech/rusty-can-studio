import { CanProfile } from "../model/profile";
import { validateCanIdLayout } from "./validateCanIdLayout";

export interface ProfileValidationError {
  scope: "canIdLayout";
  layoutId: string;
  message: string;
}

export function validateProfileDraft(profile: CanProfile): ProfileValidationError[] {
  const errors: ProfileValidationError[] = [];

  // 1️⃣ CAN ID layout overlap validation
  for (const layout of Object.values(profile.canIdLayouts)) {
    const overlaps = validateCanIdLayout(layout.fields);

    for (const o of overlaps) {
      errors.push({
        scope: "canIdLayout",
        layoutId: layout.id,
        message: `${layout.name}: ${o.fieldA} overlaps ${o.fieldB} at bits ${o.overlapRange[0]}–${o.overlapRange[1]}`,
      });
    }
  }

  //  Future:
  // - signal byte overlap
  // - derived field references
  // - column references

  return errors;
}
