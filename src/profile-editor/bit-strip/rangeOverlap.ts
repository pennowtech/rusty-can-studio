import { RangeItem } from "./rangeTypes";

export function computeOverlappingBits(fields: RangeItem[]): Set<number> {
  const overlaps = new Set<number>();

  for (let i = 0; i < fields.length; i++) {
    const a = fields[i];
    const aStart = a.start;
    const aEnd = a.start + a.length - 1;

    for (let j = i + 1; j < fields.length; j++) {
      const b = fields[j];
      const bStart = b.start;
      const bEnd = b.start + b.length - 1;

      const start = Math.max(aStart, bStart);
      const end = Math.min(aEnd, bEnd);

      if (start <= end) {
        for (let u = start; u <= end; u++) overlaps.add(u);
      }
    }
  }

  return overlaps;
}
