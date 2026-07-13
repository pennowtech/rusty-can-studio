import type { CanonicalField, CanonicalLayout, CanonicalMessage, CanonicalProfile } from "@/profile-editor/model/canonicalProfile";
import type { BitFieldDef, CanIdLayoutDef, CanProfile, PayloadFieldDef, SchemaFieldLayoutDef, SignalDef } from "@/profile-editor/model/profile";

type ProfileLike = CanProfile | CanonicalProfile;

function isCanonicalProfile(profile: ProfileLike): profile is CanonicalProfile {
  return "schemaVersion" in profile && profile.schemaVersion === "1.0";
}

function slugify(value: string | undefined, fallback: string) {
  return (
    (value ?? fallback)
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback
  );
}

function bitLengthOf(field: BitFieldDef | PayloadFieldDef) {
  return field.length;
}

function absoluteStartBit(field: BitFieldDef | PayloadFieldDef) {
  return (field.byte ?? 0) * 8 + field.startBit;
}

function canonicalField(field: BitFieldDef | PayloadFieldDef, dictionaries: Record<string, Record<string, string>>): CanonicalField {
  if (field.values) dictionaries[field.name] = field.values;
  return {
    name: field.name,
    startBit: absoluteStartBit(field),
    bitLength: bitLengthOf(field),
    type: field.type,
    dictionary: field.values ? field.name : undefined,
    factor: "factor" in field ? field.factor : undefined,
    offset: "offset" in field ? field.offset : undefined,
    unit: "unit" in field ? field.unit : undefined,
    count: "count" in field ? field.count : undefined,
    strideBits: "stride" in field && field.stride != null ? field.stride * 8 : undefined,
    display: "expression" in field && field.expression ? { expression: field.expression } : undefined,
  };
}

function canonicalSignal(signal: SignalDef): CanonicalField {
  return {
    name: signal.name,
    startBit: signal.startByte * 8 + (signal.startBit ?? 0),
    bitLength: signal.bitLength ?? signal.length * 8,
    type: signal.signed ? "int" : "uint",
    factor: signal.factor,
    offset: signal.offset,
    unit: signal.unit,
    display: signal.expression ? { expression: signal.expression } : undefined,
  };
}

function canonicalCanIdLayout(layout: CanIdLayoutDef | undefined, dictionaries: Record<string, Record<string, string>>): CanonicalLayout {
  const fields = (layout?.fields ?? []).map((field) => canonicalField(field, dictionaries));
  if (!fields.some((field) => field.name === "can_id")) {
    fields.push({
      name: "can_id",
      label: "CAN ID",
      startBit: 0,
      bitLength: layout?.bitLength ?? 29,
      type: "uint",
    });
  }
  return {
    label: layout?.label ?? layout?.name ?? "CAN ID",
    note: layout?.note,
    bitLength: layout?.bitLength ?? 29,
    fields,
  };
}

function canonicalSchemaLayout(layout: SchemaFieldLayoutDef | undefined, dictionaries: Record<string, Record<string, string>>): CanonicalLayout | undefined {
  if (!layout) return undefined;
  return {
    label: layout.label,
    note: layout.note,
    bitLength: layout.bitLength ?? (layout.lengthBytes ?? 0) * 8,
    fields: (layout.fields ?? []).map((field) => canonicalField(field, dictionaries)),
  };
}

function defaultCanIdLayout(profile: CanProfile) {
  return profile.defaultCanIdLayoutId ? profile.canIdLayouts?.[profile.defaultCanIdLayoutId] : Object.values(profile.canIdLayouts ?? {})[0];
}

function variantCommandClass(variant: string) {
  if (variant === "command") return 6;
  if (variant === "response") return 5;
  if (variant === "event") return 3;
  return undefined;
}

function expandRepeatedFields(fields: PayloadFieldDef[] = []): PayloadFieldDef[] {
  return fields.flatMap((field) => {
    const count = field.count ?? 1;
    if (count <= 1) return [field];

    const strideBits = (field.stride ?? Math.ceil(field.length / 8)) * 8;
    return Array.from({ length: count }, (_, index) => {
      const baseStart = absoluteStartBit(field);
      const start = baseStart + index * strideBits;
      const { count: _count, stride: _stride, ...withoutRepeat } = field;
      return {
        ...withoutRepeat,
        name: `${field.name}_${index}`,
        byte: Math.floor(start / 8),
        startBit: start % 8,
      };
    });
  });
}

function normalizeCompactProfile(profile: CanProfile, dictionaries: Record<string, Record<string, string>>) {
  if (!profile.service || !profile.payloadHeader || !Array.isArray(profile.attributes)) return undefined;

  dictionaries.service_identifier = {
    ...(dictionaries.service_identifier ?? {}),
    [String(profile.service.identifier)]: profile.service.name,
  };

  const messages: CanonicalMessage[] = [];
  for (const attribute of profile.attributes) {
    dictionaries.attribute_address = {
      ...(dictionaries.attribute_address ?? {}),
      [String(attribute.address)]: attribute.name,
    };

    for (const operation of attribute.operations ?? []) {
      for (const [variant, fields] of Object.entries(operation.variants ?? {})) {
        const commandClass = variantCommandClass(variant);
        if (commandClass == null) continue;
        dictionaries.feature_index = {
          ...(dictionaries.feature_index ?? {}),
          [String(operation.featureIndex)]: `${operation.type}.${variant}`,
        };

        const id = `${profile.service.name}.${attribute.name}.${operation.type}.${variant}`;
        messages.push({
          id,
          label: id,
          identifyBy: {
            service_identifier: profile.service.identifier,
            command_class: commandClass,
            attribute_address: attribute.address,
            feature_index: operation.featureIndex,
          },
          payload: {
            bitLength: Math.max(0, ...expandRepeatedFields(fields ?? []).map((field) => absoluteStartBit(field) + field.length)),
            fields: expandRepeatedFields(fields ?? []).map((field) => canonicalField(field, dictionaries)),
          },
        });
      }
    }
  }

  return {
    payloadHeader: canonicalSchemaLayout(profile.payloadHeader, dictionaries),
    messages,
  };
}

function normalizeMessageSchema(profile: CanProfile, dictionaries: Record<string, Record<string, string>>) {
  const schema = profile.messageSchema;
  if (!schema) return undefined;

  const canIdLayout = schema.canIdLayout;
  const messages = (schema.messageDefinitions ?? []).map((message) => {
    const payloadFields = message.payloadFields ?? [];
    return {
      id: message.id ?? message.name ?? message.label ?? "message",
      label: message.label ?? message.name ?? message.id ?? "Message",
      description: message.note,
      identifyBy: {
        ...(message.match?.canId ?? {}),
        ...(message.match?.payloadHeader ?? {}),
      },
      payload: {
        bitLength: Math.max(0, ...payloadFields.map((field) => absoluteStartBit(field) + field.length)),
        fields: payloadFields.map((field) => canonicalField(field, dictionaries)),
      },
    };
  });

  return {
    canIdLayout: canIdLayout
      ? {
          label: schema.name ? `${schema.name} CAN ID` : "CAN ID",
          bitLength: canIdLayout.bitLength ?? 29,
          fields: (canIdLayout.fields ?? []).map((field) => canonicalField(field, dictionaries)),
        }
      : undefined,
    payloadHeader: canonicalSchemaLayout(schema.payloadHeader, dictionaries),
    messages,
  };
}

function normalizeFrames(profile: CanProfile) {
  return Object.entries(profile.frames ?? {}).map(([key, frame]) => ({
    id: key,
    label: frame.label ?? key,
    description: frame.note,
    identifyBy: { can_id: frame.canId ?? Number.parseInt(frame.canIdLayout, 16) },
    payload: {
      bitLength: frame.payloadLength ? frame.payloadLength * 8 : Math.max(0, ...frame.signals.map((signal) => canonicalSignal(signal).startBit + canonicalSignal(signal).bitLength)),
      fields: frame.signals.map(canonicalSignal),
    },
  }));
}

function normalizeErrors(profile: CanProfile): CanonicalProfile["errors"] {
  if (!profile.errorStatus) return undefined;
  return [
    {
      id: "default_error_status",
      when:
        profile.errorStatus.goodValue != null
          ? `${profile.errorStatus.field ?? "message_good"} != ${JSON.stringify(profile.errorStatus.goodValue)}`
          : `${profile.errorStatus.field ?? "message_good"} == ${JSON.stringify(profile.errorStatus.badValue ?? 0)}`,
      source: {
        startBit: (profile.errorStatus.byteOffset ?? 0) * 8,
        bitLength: (profile.errorStatus.byteLength ?? 4) * 8,
        type: "uint",
        byteOrder: profile.errorStatus.byteOrder,
      },
      dictionary: profile.errorStatus.codes ? "error_status" : undefined,
      display: "Error ${raw}: ${text}",
    },
  ];
}

export function normalizeToCanonicalProfile(profile: ProfileLike): CanonicalProfile {
  if (isCanonicalProfile(profile)) return profile;

  const dictionaries: Record<string, Record<string, string>> = {};
  if (profile.errorStatus?.codes) dictionaries.error_status = profile.errorStatus.codes;

  const compact = normalizeCompactProfile(profile, dictionaries);
  const schema = normalizeMessageSchema(profile, dictionaries);
  const frameMessages = normalizeFrames(profile);
  const layoutFromSchema = schema?.canIdLayout
    ? {
        label: schema.canIdLayout.label,
        bitLength: schema.canIdLayout.bitLength,
        fields: schema.canIdLayout.fields,
      }
    : undefined;

  return {
    schemaVersion: "1.0",
    meta: {
      id: slugify(profile.meta.name, "profile"),
      name: profile.meta.name,
      version: profile.meta.version,
      description: profile.meta.description,
      source: profile.meta.source,
    },
    bus: {
      type: "can-fd",
      idFormat: defaultCanIdLayout(profile)?.format ?? "extended",
      byteOrder: profile.byteOrder ?? "little",
    },
    layouts: {
      canId: layoutFromSchema ?? canonicalCanIdLayout(defaultCanIdLayout(profile), dictionaries),
      payloadHeader: compact?.payloadHeader ?? schema?.payloadHeader,
    },
    dictionaries,
    messages: [...(compact?.messages ?? []), ...(schema?.messages ?? []), ...frameMessages],
    errors: normalizeErrors(profile),
    display: {},
  };
}
