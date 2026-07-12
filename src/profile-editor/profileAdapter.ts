import type { CanIdLayoutDef, CanProfile, MessageSchemaDef, PayloadFieldDef, SchemaRouteDef } from "@/profile-editor/model/profile";

function stripFieldByteOrder<T extends Record<string, unknown>>(field: T): Omit<T, "byteOrder"> {
  const { byteOrder: _byteOrder, ...normalizedField } = field;
  return normalizedField;
}

function expandRepeatedFields(fields: PayloadFieldDef[] = []): PayloadFieldDef[] {
  return fields.flatMap((field) => {
    const count = field.count ?? 1;
    if (count <= 1) return [stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" }) as PayloadFieldDef];

    const strideBits = (field.stride ?? Math.ceil(field.length / 8)) * 8;
    return Array.from({ length: count }, (_, index) => {
      const expanded = stripFieldByteOrder(field as typeof field & { byteOrder?: "little" | "big" }) as PayloadFieldDef;
      const baseStart = (field.byte ?? 0) * 8 + field.startBit;
      const start = baseStart + index * strideBits;
      const { count: _count, stride: _stride, ...withoutRepeat } = expanded;
      return {
        ...withoutRepeat,
        name: `${field.name}_${index}`,
        byte: Math.floor(start / 8),
        startBit: start % 8,
      };
    });
  });
}

function variantCommandClass(variant: string) {
  if (variant === "command") return 6;
  if (variant === "response") return 5;
  if (variant === "event") return 3;
  return undefined;
}

export function schemaFromCompactProfile(profile: CanProfile): MessageSchemaDef | undefined {
  if (!profile.service || !profile.payloadHeader || !Array.isArray(profile.attributes)) return undefined;

  const messageDefinitions: SchemaRouteDef[] = [];
  for (const attribute of profile.attributes) {
    for (const operation of attribute.operations ?? []) {
      for (const [variant, fields] of Object.entries(operation.variants ?? {})) {
        const commandClass = variantCommandClass(variant);
        if (commandClass == null) continue;

        const id = `${profile.service.name}.${attribute.name}.${operation.type}.${variant}`;
        messageDefinitions.push({
          id,
          label: `${attribute.name}.${operation.type}.${variant}`,
          serviceName: profile.service.name,
          attributeName: attribute.name,
          featureName: `${operation.type}.${variant}`,
          meaning: id,
          match: {
            canId: {
              service_identifier: profile.service.identifier,
              command_class: commandClass,
            },
            payloadHeader: {
              attribute_address: attribute.address,
              feature_index: operation.featureIndex,
            },
          },
          payloadFields: expandRepeatedFields(fields ?? []),
        });
      }
    }
  }

  return {
    name: profile.service.name,
    canIdLayoutRef: profile.canIdLayoutRef,
    payloadHeader: profile.payloadHeader,
    messageDefinitions,
    errors: profile.errorStatus?.codes ?? {},
    error: profile.errorStatus
      ? {
          field: profile.errorStatus.field,
          goodValue: profile.errorStatus.goodValue,
          badValue: profile.errorStatus.badValue,
          byteOffset: profile.errorStatus.byteOffset,
          byteLength: profile.errorStatus.byteLength,
          byteOrder: profile.errorStatus.byteOrder,
          values: profile.errorStatus.codes ?? {},
        }
      : undefined,
  };
}

export function getProfileMessageSchema(profile: CanProfile | null | undefined): MessageSchemaDef | undefined {
  if (!profile) return undefined;
  return profile.messageSchema ?? schemaFromCompactProfile(profile);
}

export function getProfileCanIdLayoutRef(profile: CanProfile | null | undefined) {
  if (!profile) return undefined;
  return getProfileMessageSchema(profile)?.canIdLayoutRef ?? profile.canIdLayoutRef ?? profile.defaultCanIdLayoutId;
}

export function getProfileCanIdLayout(profile: CanProfile | null | undefined): CanIdLayoutDef | undefined {
  if (!profile) return undefined;
  const ref = getProfileCanIdLayoutRef(profile);
  return ref ? profile.canIdLayouts?.[ref] : Object.values(profile.canIdLayouts ?? {})[0];
}

export function hasProfileMessages(profile: CanProfile | null | undefined) {
  return Boolean(getProfileMessageSchema(profile)?.messageDefinitions?.length);
}
