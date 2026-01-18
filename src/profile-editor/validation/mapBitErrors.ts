import { BitOverlapError } from "./validateCanIdLayout";

export function mapBitErrors(errors: BitOverlapError[]): Record<string, BitOverlapError[]> {
  const map: Record<string, BitOverlapError[]> = {};

  for (const e of errors) {
    map[e.fieldA] ??= [];
    map[e.fieldB] ??= [];

    map[e.fieldA].push(e);
    map[e.fieldB].push(e);
  }

  return map;
}
