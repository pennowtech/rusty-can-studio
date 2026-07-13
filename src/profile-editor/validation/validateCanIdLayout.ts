export interface BitOverlapError {
  fieldA: string;
  fieldB: string;
  overlapRange: [number, number];
}

type BitLayoutField = {
  name: string;
  startBit: number;
  bitLength: number;
};

export function validateCanIdLayout(fields: BitLayoutField[]): BitOverlapError[] {
  const errors: BitOverlapError[] = [];

  for (let i = 0; i < fields.length; i++) {
    const a = fields[i];
    const aStart = a.startBit;
    const aEnd = a.startBit + a.bitLength - 1;

    for (let j = i + 1; j < fields.length; j++) {
      const b = fields[j];
      const bStart = b.startBit;
      const bEnd = b.startBit + b.bitLength - 1;

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
