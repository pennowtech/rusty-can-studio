import { CanIdField } from "../model/profile";

export interface BitOverlapError {
  fieldA: string;
  fieldB: string;
  overlapRange: [number, number];
}

export function validateCanIdLayout(fields: CanIdField[]): BitOverlapError[] {
  const errors: BitOverlapError[] = [];

  for (let i = 0; i < fields.length; i++) {
    const a = fields[i];
    const aStart = a.startBit;
    const aEnd = a.startBit + a.length - 1;

    for (let j = i + 1; j < fields.length; j++) {
      const b = fields[j];
      const bStart = b.startBit;
      const bEnd = b.startBit + b.length - 1;

      const overlapStart = Math.max(aStart, bStart);
      const overlapEnd = Math.min(aEnd, bEnd);

      if (overlapStart <= overlapEnd) {
        errors.push({
          fieldA: a.name,
          fieldB: b.name,
          overlapRange: [overlapStart, overlapEnd],
        });
      }
    }
  }

  return errors;
}
