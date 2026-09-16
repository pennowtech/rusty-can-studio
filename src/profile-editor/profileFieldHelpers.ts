import type { CanonicalField, CanonicalVariant } from "@/profile-editor/model/canonicalProfile";

// Shared field/variant constructors and the generic field-patch helper —
// used by the Message Gallery, the message editor drawer, and the
// remaining profile tabs (CAN ID layout, payload common). Kept CAN-schema
// specific (unlike the kit's RangeGridEditor) since CanonicalField/
// CanonicalVariant are this app's own model.

export function createField(index: number, startBit = 0): CanonicalField {
  return {
    name: `field_${index + 1}`,
    startBit,
    bitLength: 8,
    type: "uint",
  };
}

export function createVariant(index: number): CanonicalVariant {
  return {
    id: `message_${index + 1}`,
    label: `Message ${index + 1}`,
    payload: {
      bitLength: 0,
      fields: [],
    },
  };
}

// A variant no longer carries its own identifyBy — the discriminator field
// names (profile.payload.discriminator) zipped with its own variants[]
// map key (split on ":") reconstructs the same identifying values, for
// callers (buildIdentifier/canComputeIdentifier below, message list CAN ID
// badges) that were written against an identifyBy-shaped object.
export function identifyByFromVariantKey(discriminator: string[], key: string): Record<string, number | string> {
  const parts = key.split(":");
  return Object.fromEntries(
    discriminator.map((name, index) => {
      const raw = parts[index] ?? "";
      const numeric = Number(raw);
      return [name, raw !== "" && Number.isFinite(numeric) ? numeric : raw];
    }),
  );
}

export function updateField(fields: CanonicalField[], index: number, patch: Partial<CanonicalField>) {
  fields[index] = { ...fields[index], ...patch };
}

export function reorderInPlace<T>(items: T[], from: number, to: number) {
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
}

export function matchesSearch(text: string, ...parts: Array<string | number | undefined>) {
  if (!text) return true;
  return parts
    .filter((part) => part != null)
    .join(" ")
    .toLowerCase()
    .includes(text);
}

export function byteLength(bitLength: number) {
  return Math.ceil(bitLength / 8);
}

export function cleanHex(hex: string) {
  return hex.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}

export function hexToBytes(hex: string) {
  const cleaned = cleanHex(hex);
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) bytes.push(Number.parseInt(cleaned.slice(i, i + 2).padEnd(2, "0"), 16));
  return bytes;
}

// Computes the numeric CAN ID a message would be sent/matched on, from the
// profile's CAN-ID layout fields and this message's own `identifyBy`
// values — the same reduction the runtime decoder implicitly relies on
// (each CAN-ID field's value, shifted into its bit position). Falls back
// to a literal `identifyBy.can_id` when the profile identifies messages by
// a single whole-ID field named exactly that (the common case) rather than
// a multi-field arbitration ID layout.
export function buildIdentifier(canIdFields: CanonicalField[], identifyBy: Record<string, unknown>) {
  if (typeof identifyBy.can_id === "number") return identifyBy.can_id;
  return canIdFields.reduce((id, field) => {
    const raw = identifyBy[field.name];
    const value = typeof raw === "number" ? raw : Number(raw ?? 0);
    if (!Number.isFinite(value)) return id;
    const mask = field.bitLength >= 32 ? 0xffffffff : 2 ** field.bitLength - 1;
    return id + (Math.floor(value) & mask) * 2 ** field.startBit;
  }, 0);
}

// True once at least one CAN-ID field the profile defines has a matching,
// numeric value in `identifyBy` — i.e. buildIdentifier's result reflects
// real identification data, not just "0 because nothing matched at all".
// Fields a message doesn't set (e.g. a constant `broadcast`/`toggle` bit
// most messages never vary) default to 0 in buildIdentifier — that's
// expected, not a reason to hide the computed id. A profile that
// identifies messages purely by name/string criteria, with no overlap
// with any canId field at all, still falls back to the raw message id.
export function canComputeIdentifier(canIdFields: CanonicalField[], identifyBy: Record<string, unknown>) {
  if (typeof identifyBy.can_id === "number") return true;
  if (!canIdFields.length) return false;
  return canIdFields.some((field) => {
    const raw = identifyBy[field.name];
    return typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw)));
  });
}
