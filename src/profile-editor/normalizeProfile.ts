// This:
// - Applies defaults
// - Ensures arrays/objects exist
// - Makes editor safe

import { CanIdLayoutDef, CanProfile, MessageSchemaDef } from "./model/profile";

function isCompactProfile(raw: CanProfile) {
  return Boolean(raw.service && raw.payloadHeader && Array.isArray(raw.attributes));
}

function withHiddenDefaults(profile: CanProfile, defaults: Partial<CanProfile>) {
  for (const [key, value] of Object.entries(defaults) as Array<[keyof CanProfile, unknown]>) {
    if (profile[key] !== undefined) continue;
    Object.defineProperty(profile, key, {
      value,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  return profile;
}

function stripFieldByteOrder<T extends Record<string, unknown>>(field: T): Omit<T, "byteOrder"> {
  const { byteOrder: _byteOrder, ...normalizedField } = field;
  return normalizedField;
}

function normalizeFrames(rawFrames: CanProfile["frames"] = {}): CanProfile["frames"] {
  return Object.fromEntries(
    Object.entries(rawFrames).map(([key, frame]) => [
      key,
      {
        ...frame,
        signals: (frame.signals ?? []).map((signal) => {
          return stripFieldByteOrder(signal as typeof signal & { byteOrder?: "little" | "big" });
        }),
      },
    ]),
  );
}

function normalizeKnossos(rawKnossos: CanProfile["knossos"]): CanProfile["knossos"] {
  if (!rawKnossos) return undefined;

  return {
    ...rawKnossos,
    canIdLayout: {
      ...rawKnossos.canIdLayout,
      fields: (rawKnossos.canIdLayout.fields ?? []).map((field) => stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" })),
    },
    payloadHeader: {
      ...rawKnossos.payloadHeader,
      fields: (rawKnossos.payloadHeader.fields ?? []).map((field) => stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" })),
    },
    services: (rawKnossos.services ?? []).map((service) => ({
      ...service,
      instances: (service.instances ?? []).map((instance) => ({
        ...instance,
        attributes: (instance.attributes ?? []).map((attribute) => ({
          ...attribute,
          features: (attribute.features ?? []).map((feature) => ({
            ...feature,
            fields: (feature.fields ?? []).map((field) => stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" })),
          })),
        })),
      })),
    })),
  };
}

function normalizeMessageSchema(rawSchema: MessageSchemaDef | undefined): MessageSchemaDef | undefined {
  if (!rawSchema) return undefined;

  return {
    ...rawSchema,
    canIdLayout: rawSchema.canIdLayout
      ? {
          ...rawSchema.canIdLayout,
          fields: (rawSchema.canIdLayout.fields ?? []).map((field) => stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" })),
        }
      : undefined,
    payloadHeader: rawSchema.payloadHeader
      ? {
          ...rawSchema.payloadHeader,
          fields: (rawSchema.payloadHeader.fields ?? []).map((field) => stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" })),
        }
      : undefined,
    messageDefinitions: (rawSchema.messageDefinitions ?? []).map((definition) => {
      const rawDefinition = definition as typeof definition;
      return {
        ...rawDefinition,
        id: rawDefinition.id ?? "message_definition",
        match: {
          ...(rawDefinition.match ?? {}),
          payloadHeader: rawDefinition.match?.payloadHeader ?? {},
        },
        payloadFields: (rawDefinition.payloadFields ?? []).map((field) =>
          stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" }),
        ),
      };
    }),
  };
}

export function normalizeProfile(raw: CanProfile): CanProfile {
  if (isCompactProfile(raw)) {
    const compactProfile = {
      meta: {
        name: raw.meta?.name ?? "Unnamed Profile",
        version: raw.meta?.version,
        description: raw.meta?.description,
        source: raw.meta?.source,
      },
      byteOrder: raw.byteOrder ?? "little",
      protocol: raw.protocol ?? "schema",
      canIdLayoutRef: raw.canIdLayoutRef,
      service: raw.service,
      payloadHeader: raw.payloadHeader
        ? {
            ...raw.payloadHeader,
            fields: (raw.payloadHeader.fields ?? []).map((field) => stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" })),
          }
        : undefined,
      attributes: raw.attributes?.map((attribute) => ({
        ...attribute,
        operations: (attribute.operations ?? []).map((operation) => ({
          ...operation,
          variants: Object.fromEntries(
            Object.entries(operation.variants ?? {}).map(([variant, fields]) => [
              variant,
              (fields ?? []).map((field) => stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" })),
            ]),
          ),
        })),
      })),
      errorStatus: raw.errorStatus,
    } as CanProfile;

    return withHiddenDefaults(compactProfile, {
      defaultCanIdLayoutId: raw.defaultCanIdLayoutId ?? raw.canIdLayoutRef,
      canIdLayouts: raw.canIdLayouts ?? {},
      frames: raw.frames ?? {},
      fieldTypes: raw.fieldTypes ?? {},
      derivedFields: Array.isArray(raw.derivedFields) ? raw.derivedFields : [],
      columns: Array.isArray(raw.columns) ? raw.columns : [],
      knossos: normalizeKnossos(raw.knossos),
      messageSchema: normalizeMessageSchema(raw.messageSchema),
    });
  }

  const rawAny = raw as CanProfile & Record<string, unknown>;
  const canIdLayouts = { ...(raw.canIdLayouts ?? {}) };
  const defaultCanIdLayoutId = raw.defaultCanIdLayoutId ?? raw.canIdLayoutRef ?? Object.keys(canIdLayouts)[0];
  const referencedLayout = defaultCanIdLayoutId ? rawAny[defaultCanIdLayoutId] : undefined;
  if (
    defaultCanIdLayoutId &&
    !canIdLayouts[defaultCanIdLayoutId] &&
    referencedLayout &&
    typeof referencedLayout === "object" &&
    Array.isArray((referencedLayout as CanIdLayoutDef).fields)
  ) {
    canIdLayouts[defaultCanIdLayoutId] = referencedLayout as CanIdLayoutDef;
  }
  const messageSchema = normalizeMessageSchema(raw.messageSchema);

  return {
    meta: {
      name: raw.meta?.name ?? "Unnamed Profile",
      version: raw.meta?.version,
      description: raw.meta?.description,
      source: raw.meta?.source,
    },

    byteOrder: raw.byteOrder ?? "little",
    defaultCanIdLayoutId,
    canIdLayoutRef: raw.canIdLayoutRef,
    protocol: raw.protocol ?? (messageSchema || raw.attributes ? "schema" : "generic"),
    service: raw.service,
    payloadHeader: raw.payloadHeader
      ? {
          ...raw.payloadHeader,
          fields: (raw.payloadHeader.fields ?? []).map((field) => stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" })),
        }
      : undefined,
    attributes: raw.attributes?.map((attribute) => ({
      ...attribute,
      operations: (attribute.operations ?? []).map((operation) => ({
        ...operation,
        variants: Object.fromEntries(
          Object.entries(operation.variants ?? {}).map(([variant, fields]) => [
            variant,
            (fields ?? []).map((field) => stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" })),
          ]),
        ),
      })),
    })),
    errorStatus: raw.errorStatus,
    messageSchema,
    knossos: normalizeKnossos(raw.knossos),

    canIdLayouts,

    frames: normalizeFrames(raw.frames),

    fieldTypes: raw.fieldTypes ?? {},

    derivedFields: Array.isArray(raw.derivedFields) ? raw.derivedFields : [],

    columns: Array.isArray(raw.columns) ? raw.columns : [],
  };
}
