import { ProfileDocument } from "../model/profile";
import { validateCanIdLayout } from "./validateCanIdLayout";

export interface ProfileValidationError {
  scope: "canIdLayout";
  layoutId: string;
  message: string;
}

export function validateProfileDraft(profile: ProfileDocument): ProfileValidationError[] {
  const fields = profile.layouts.canId.fields.map((field) => ({
    name: field.name,
    startBit: field.startBit,
    bitLength: field.bitLength,
  }));
  return validateCanIdLayout(fields).map((overlap) => ({
    scope: "canIdLayout",
    layoutId: profile.layouts.canId.label ?? "canId",
    message: `${profile.layouts.canId.label ?? "CAN ID"}: ${overlap.fieldA} overlaps ${overlap.fieldB} at bits ${overlap.overlapRange[0]}-${overlap.overlapRange[1]}`,
  }));
}
