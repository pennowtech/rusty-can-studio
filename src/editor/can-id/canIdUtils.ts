import { CanIdLayoutModel } from "@/model/canId";

export function findNextFreeBit(layout: CanIdLayoutModel): number {
  const used = new Set<number>();

  Object.values(layout.fields).forEach((f) => {
    for (let b = f.startBit; b < f.startBit + f.length; b++) {
      used.add(b);
    }
  });

  for (let i = 0; i < layout.bitLength; i++) {
    if (!used.has(i)) return i;
  }

  return 0;
}
