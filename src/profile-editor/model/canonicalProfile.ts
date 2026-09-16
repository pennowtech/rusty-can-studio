export type CanonicalBusType = "can" | "can-fd";
export type CanonicalIdFormat = "standard" | "extended" | "custom";
export type CanonicalByteOrder = "little" | "big";
export type CanonicalFieldType = "uint" | "int" | "bool" | "enum" | "bytes" | "string";

export type CanonicalProfileMeta = {
  id: string;
  name: string;
  version: string;
  description?: string;
  source?: string;
};

export type CanonicalProfileBus = {
  type: CanonicalBusType;
  idFormat: CanonicalIdFormat;
  byteOrder: CanonicalByteOrder;
};

export type CanonicalField = {
  name: string;
  label?: string;
  note?: string;
  startBit: number;
  bitLength: number;
  type?: CanonicalFieldType;
  dictionary?: string;
  factor?: number;
  offset?: number;
  unit?: string;
  count?: number;
  strideBits?: number;
  display?: {
    expression?: string;
  };
};

export type CanonicalLayout = {
  label?: string;
  note?: string;
  bitLength: number;
  fields: CanonicalField[];
  // When set, `fields`/`bitLength` here are ignored at view time in favor
  // of whichever other loaded profile's own layout is named — lets many
  // message-only profiles share one CAN ID layout / payload common layout
  // without copy-pasting it into every file. On disk this can be written
  // as just `{ "ref_file": "k2_common.json" }`; the loader normalizes it
  // to include empty `fields`/`bitLength` so this type stays simple and
  // every existing reader keeps working unchanged (see
  // normalizeProfileLayouts in store/profileStore.ts). Resolved at view
  // time (see resolveProfileReferences); never written back with a
  // concrete layout merged in.
  ref_file?: string;
};

// One decodable shape of a profile's payload, selected by the discriminator
// key it's registered under in CanonicalProfile.payload.variants. Mirrors
// FlexMQTT's JsonStructVariant (jsonStructCodec.ts) — deliberately doesn't
// carry `identifyBy` itself: the key it's stored under IS the identifying
// value tuple (profile.payload.discriminator field names, zipped with the
// key split on ":"), so there's nothing to keep in sync separately.
// `identifyWhen` is only needed on the rare variant that shares its key
// with another (see CanonicalProfile.payload.variants doc) — equality
// alone couldn't tell them apart, so the profile stores that key's value
// as an array and each entry's identifyWhen picks the right one.
export type CanonicalVariant = {
  id: string;
  label: string;
  description?: string;
  identifyWhen?: string;
  payload: {
    bitLength: number;
    fields: CanonicalField[];
    display?: {
      expression?: string;
    };
  };
};

export type CanonicalErrorRule = {
  id: string;
  when: string;
  source: {
    startBit: number;
    bitLength: number;
    type: "uint" | "int";
    byteOrder?: CanonicalByteOrder;
  };
  dictionary?: string;
  display?: string;
};

export type CanonicalProfile = {
  schemaVersion: "1.0";
  meta: CanonicalProfileMeta;
  bus: CanonicalProfileBus;
  layouts: {
    canId: CanonicalLayout;
  };
  payload: {
    // Was `layouts.payloadHeader` — decoded once per frame, ahead of
    // whichever variant matches, same `ref_file` sharing mechanism as
    // `layouts.canId`. Optional: a profile with no shared header fields
    // (e.g. J1939-style, discriminated entirely off the CAN ID) omits it.
    common?: CanonicalLayout;
    // Ordered field names — drawn from `layouts.canId.fields` and/or
    // `payload.common.fields` — whose decoded values together select a
    // variant. Joined with ":" to form each variants[] key. A field that's
    // constant across every variant in this file (e.g. a service
    // identifier that never varies within one profile) doesn't need to be
    // listed here — the right profile is already selected (by
    // decodeFrameWithProfiles trying each loaded profile) before variants
    // are ever consulted.
    discriminator: string[];
    // Keyed by discriminator values joined with ":" (e.g. "6:0:1"). A key
    // maps to a single variant in the overwhelmingly common case; an array
    // is only needed when discriminator equality alone can't tell two
    // variants apart (each entry's `identifyWhen` disambiguates then — see
    // CanonicalVariant).
    variants: Record<string, CanonicalVariant | CanonicalVariant[]>;
  };
  dictionaries?: Record<string, Record<string, string>>;
  errors?: CanonicalErrorRule[];
  display?: Record<string, unknown>;
};
