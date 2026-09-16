import { ProfileDocument } from "../model/profile";
import { validateBitLayout } from "./validateBitLayout";
import { listVariants } from "@/profile-editor/messageListHelpers";

export interface ProfileValidationError {
  scope: "canIdLayout" | "payloadCommon" | "payload";
  /** CAN ID layout label, payload common label, or the owning variant's id for payload-scope errors. */
  layoutId: string;
  message: string;
}

function toBitLayoutFields(fields: { name: string; startBit: number; bitLength: number }[]) {
  return fields.map((field) => ({ name: field.name, startBit: field.startBit, bitLength: field.bitLength }));
}

export function validateProfileDraft(profile: ProfileDocument): ProfileValidationError[] {
  const errors: ProfileValidationError[] = [];

  const canIdLabel = profile.layouts.canId.label ?? "CAN ID";
  for (const overlap of validateBitLayout(toBitLayoutFields(profile.layouts.canId.fields))) {
    errors.push({
      scope: "canIdLayout",
      layoutId: canIdLabel,
      message: `${canIdLabel}: ${overlap.fieldA} overlaps ${overlap.fieldB} at bits ${overlap.overlapRange[0]}-${overlap.overlapRange[1]}`,
    });
  }

  const common = profile.payload.common;
  const commonLabel = common?.label ?? "Payload common";
  if (common) {
    for (const overlap of validateBitLayout(toBitLayoutFields(common.fields))) {
      errors.push({
        scope: "payloadCommon",
        layoutId: commonLabel,
        message: `${commonLabel}: ${overlap.fieldA} overlaps ${overlap.fieldB} at bits ${overlap.overlapRange[0]}-${overlap.overlapRange[1]}`,
      });
    }
  }

  // Each variant checked together with the common fields it's actually
  // decoded alongside — closes a gap the old payloadHeader/messages split
  // never caught (a variant field silently overlapping a common field).
  // Common-vs-common overlaps are skipped here — already reported above —
  // so they don't get repeated once per variant.
  const commonNames = new Set((common?.fields ?? []).map((field) => field.name));
  for (const { variant } of listVariants(profile)) {
    const combined = [...(common?.fields ?? []), ...variant.payload.fields];
    for (const overlap of validateBitLayout(toBitLayoutFields(combined))) {
      if (commonNames.has(overlap.fieldA) && commonNames.has(overlap.fieldB)) continue;
      errors.push({
        scope: "payload",
        layoutId: variant.id,
        message: `${variant.label ?? variant.id}: ${overlap.fieldA} overlaps ${overlap.fieldB} at bits ${overlap.overlapRange[0]}-${overlap.overlapRange[1]}`,
      });
    }
  }

  return errors;
}
