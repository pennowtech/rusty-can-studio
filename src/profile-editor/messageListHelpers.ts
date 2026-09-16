import { computeOverlappingBits } from "@sbt/desktop-kit/components/rangeOverlap";
import type { CanonicalVariant } from "@/profile-editor/model/canonicalProfile";
import type { ProfileDocument } from "@/profile-editor/model/profile";
import { buildIdentifier, byteLength, canComputeIdentifier, identifyByFromVariantKey } from "@/profile-editor/profileFieldHelpers";

export type VariantEntry = { key: string; variant: CanonicalVariant };

// Every variant in a profile, alongside the discriminator key it's
// registered under (a key can hold one variant or, when discriminator
// equality alone can't disambiguate, an array of them — see
// CanonicalProfile.payload.variants doc) — the flat list every message
// list/gallery/table view iterates instead of touching
// profile.payload.variants' map/array shape directly.
export function listVariants(profile: ProfileDocument): VariantEntry[] {
  return Object.entries(profile.payload.variants).flatMap(([key, entry]) => (Array.isArray(entry) ? entry : [entry]).map((variant) => ({ key, variant })));
}

export function messageUsage(variant: CanonicalVariant) {
  const items = variant.payload.fields.map((f) => ({ id: f.name, start: f.startBit, length: f.bitLength, label: f.name }));
  const overlapBits = computeOverlappingBits(items);
  const highestBit = items.reduce((max, item) => Math.max(max, item.start + item.length), 0);
  const totalBits = Math.max(8, variant.payload.bitLength, Math.ceil(highestBit / 8) * 8);
  const totalBytes = byteLength(totalBits);

  const segments = Array.from({ length: totalBytes }, (_, byte) => {
    const bitStart = byte * 8;
    const bitEnd = bitStart + 7;
    let used = false;
    let error = false;
    for (const item of items) {
      const itemEnd = item.start + item.length - 1;
      if (item.start <= bitEnd && itemEnd >= bitStart) used = true;
    }
    for (let b = bitStart; b <= Math.min(bitEnd, totalBits - 1); b++) if (overlapBits.has(b)) error = true;
    return { used, error };
  });

  return {
    totalBytes,
    hasError: overlapBits.size > 0,
    segments,
  };
}

export function idBadgeFor(key: string, activeProfile: ProfileDocument, fallbackId: string) {
  const canIdFields = activeProfile.layouts.canId.fields;
  const identifyBy = identifyByFromVariantKey(activeProfile.payload.discriminator, key);
  return canComputeIdentifier(canIdFields, identifyBy)
    ? `0x${buildIdentifier(canIdFields, identifyBy).toString(16).toUpperCase().padStart(canIdFields.length ? Math.ceil(activeProfile.layouts.canId.bitLength / 4) : 0, "0")}`
    : fallbackId;
}
