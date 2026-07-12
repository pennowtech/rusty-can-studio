import type { WsFrame } from "@/can-bridge/ws/types";
import type {
  BitFieldDef,
  CanIdLayoutDef,
  CanProfile,
  KnossosSchemaDef,
  MessageSchemaDef,
  PayloadFieldDef,
  SchemaFieldLayoutDef,
  SchemaRouteDef,
  SignalDef,
} from "@/profile-editor/model/profile";
import { getProfileMessageSchema } from "@/profile-editor/profileAdapter";

type ResolvedMessageSchema = MessageSchemaDef & { canIdLayout: SchemaFieldLayoutDef };

export type DecodedField = {
  name: string;
  raw: number;
  physical: number;
  displayValue: string;
  unit?: string;
  startBit: number;
  length: number;
  source: "canId" | "payload";
  meaning?: string;
};

export type DecodedFrame = {
  frameName?: string;
  commandClass?: string;
  sourceAddress?: number;
  destinationAddress?: number;
  serviceName?: string;
  serviceIdentifier?: number;
  instanceName?: string;
  instanceIndex?: number;
  attributeName?: string;
  attributeAddress?: number;
  featureName?: string;
  featureIndex?: number;
  messageGood?: boolean;
  errorCode?: number;
  errorText?: string;
  canIdFields: DecodedField[];
  payloadFields: DecodedField[];
  fields: DecodedField[];
  meaning: string;
  requiresSchema?: boolean;
};

function bytesFromHex(hex: string) {
  const cleaned = hex.replace(/[^0-9a-fA-F]/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(Number.parseInt(cleaned.slice(i, i + 2).padEnd(2, "0"), 16));
  }
  return bytes;
}

function getPayloadBit(bytes: number[], bitIndex: number) {
  const byteIndex = Math.floor(bitIndex / 8);
  const bitInByte = bitIndex % 8;
  return ((bytes[byteIndex] ?? 0) >> bitInByte) & 1;
}

function extractFromBytes(bytes: number[], field: BitFieldDef | PayloadFieldDef, byteOrder: "little" | "big" = "little") {
  const startBit = field.byte != null ? field.byte * 8 + field.startBit : field.startBit;
  let raw = 0;

  if (byteOrder === "little") {
    for (let i = 0; i < field.length; i++) {
      raw += getPayloadBit(bytes, startBit + i) * 2 ** i;
    }
    return raw;
  }

  for (let i = 0; i < field.length; i++) {
    raw = raw * 2 + getPayloadBit(bytes, startBit + i);
  }
  return raw;
}

function bitMask(length: number) {
  return length >= 32 ? 0xffffffff : 2 ** length - 1;
}

function extractFromCanId(id: number, field: BitFieldDef) {
  return Math.floor(id / 2 ** field.startBit) & bitMask(field.length);
}

function formatPhysical(value: number, unit?: string) {
  const text = Number.isInteger(value) ? value.toString() : value.toFixed(3);
  return unit ? `${text} ${unit}` : text;
}

function isSafeExpression(expression: string, allowedNames: Set<string>) {
  if (!/^[\w\s()+\-*/%<>=!&|?:.,"'\\]+$/.test(expression)) return false;
  if (/[;{}[\]`]/.test(expression)) return false;
  if (/\b(?:function|return|while|for|class|new|this|globalThis|window|document|eval|import|await|async)\b/.test(expression)) return false;

  const expressionWithoutStrings = expression.replace(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g, "");
  const names = expressionWithoutStrings.match(/\b[A-Za-z_]\w*\b/g) ?? [];
  return names.every((name) => allowedNames.has(name));
}

function evaluateExpression(expression: string | undefined, context: Record<string, number>) {
  if (!expression?.trim()) return undefined;

  const names = Object.keys(context);
  const allowedNames = new Set(names);
  if (!isSafeExpression(expression, allowedNames)) return undefined;

  try {
    const fn = new Function(...names, `"use strict"; return (${expression});`) as (...values: number[]) => unknown;
    const result = fn(...names.map((name) => context[name]));
    if (typeof result === "number") return Number.isFinite(result) ? result : undefined;
    if (typeof result === "boolean") return Number(result);
    if (typeof result === "string") return result;
    return undefined;
  } catch {
    return undefined;
  }
}

function fieldMeaning(raw: number, field: BitFieldDef | PayloadFieldDef, values?: Record<string, string>) {
  return field.values?.[String(raw)] ?? values?.[String(raw)];
}

function decodedDisplay(physical: number, unit: string | undefined, meaning: string | undefined) {
  return meaning ?? formatPhysical(physical, unit);
}

function decodeCanIdField(id: number, field: BitFieldDef, values?: Record<string, string>): DecodedField {
  const raw = extractFromCanId(id, field);
  const meaning = fieldMeaning(raw, field, values);
  return {
    name: field.name,
    raw,
    physical: raw,
    displayValue: decodedDisplay(raw, undefined, meaning),
    startBit: field.startBit,
    length: field.length,
    source: "canId",
    meaning,
  };
}

function decodePayloadField(
  bytes: number[],
  field: PayloadFieldDef | BitFieldDef,
  byteOrder: "little" | "big",
  context: Record<string, number> = {},
): DecodedField {
  const startBit = field.byte != null ? field.byte * 8 + field.startBit : field.startBit;
  const raw = extractFromBytes(bytes, field, byteOrder);
  const scaled = raw * (("factor" in field ? field.factor : undefined) ?? 1) + (("offset" in field ? field.offset : undefined) ?? 0);
  const expressionValue = evaluateExpression("expression" in field ? field.expression : undefined, {
    ...context,
    raw,
    value: scaled,
  });
  const physical = typeof expressionValue === "number" ? expressionValue : scaled;
  const unit = "unit" in field ? field.unit : undefined;
  const meaning = fieldMeaning(raw, field);
  const displayValue = typeof expressionValue === "string" ? expressionValue : decodedDisplay(physical, unit, meaning);
  return {
    name: field.name,
    raw,
    physical,
    displayValue,
    unit,
    startBit,
    length: field.length,
    source: "payload",
    meaning,
  };
}

function decodeSignal(bytes: number[], signal: SignalDef, byteOrder: "little" | "big"): DecodedField {
  const startBit = signal.startBit ?? signal.startByte * 8;
  const length = signal.bitLength ?? signal.length * 8;
  let raw = extractFromBytes(
    bytes,
    {
      name: signal.name,
      startBit,
      length,
    },
    byteOrder,
  );

  if (signal.signed && length > 0) {
    const signBit = 2 ** (length - 1);
    if (raw >= signBit) raw -= 2 ** length;
  }

  const scaled = raw * (signal.factor ?? 1) + (signal.offset ?? 0);
  const expressionValue = evaluateExpression(signal.expression, { raw, value: scaled });
  const physical = typeof expressionValue === "number" ? expressionValue : scaled;
  const displayValue = typeof expressionValue === "string" ? expressionValue : formatPhysical(physical, signal.unit);

  return {
    name: signal.name,
    raw,
    physical,
    displayValue,
    unit: signal.unit,
    startBit,
    length,
    source: "payload",
  };
}

function valuesByName(fields: DecodedField[]) {
  return Object.fromEntries(fields.map((field) => [field.name, field.raw]));
}

function applyDisplayOverrides(fields: DecodedField[], overrides: Record<string, string | undefined>) {
  return fields.map((field) => {
    const displayValue = overrides[field.name];
    return displayValue
      ? {
          ...field,
          displayValue,
          meaning: displayValue,
        }
      : field;
  });
}

function matchesExpected(actual: number | undefined, expected: number | string | boolean) {
  if (actual == null) return false;
  if (typeof expected === "boolean") return Boolean(actual) === expected;
  if (typeof expected === "number") return actual === expected;
  return String(actual) === expected;
}

function canIdMatch(route: SchemaRouteDef, canFields: Record<string, number>) {
  return Object.entries(route.match?.canId ?? {}).every(([field, expected]) => matchesExpected(canFields[field], expected));
}

function payloadHeaderMatch(route: SchemaRouteDef, headerFields: Record<string, number>) {
  return Object.entries(route.match?.payloadHeader ?? {}).every(([field, expected]) => matchesExpected(headerFields[field], expected));
}

function readInteger(bytes: number[], byteOffset: number, byteLength: number, byteOrder: "little" | "big") {
  let value = 0;
  for (let index = 0; index < byteLength; index++) {
    const byte = bytes[byteOffset + index] ?? 0;
    value = byteOrder === "little" ? value + byte * 256 ** index : value * 256 + byte;
  }
  return value;
}

function schemaFromKnossos(knossos: KnossosSchemaDef): ResolvedMessageSchema {
  const messageDefinitions = knossos.services.flatMap((service) =>
    service.instances.flatMap((instance) =>
      instance.attributes.flatMap((attribute) =>
        attribute.features.map((feature) => ({
          id: `${service.name}.${instance.name}.${attribute.name}.${feature.name}`,
          serviceName: service.name,
          instanceName: instance.name,
          attributeName: attribute.name,
          featureName: feature.name,
          match: {
            canId: { service_identifier: service.serviceIdentifier },
            payloadHeader: {
              instance_index: instance.index,
              attribute_address: attribute.attributeAddress,
              feature_index: feature.index,
            },
          },
          payloadFields: feature.fields,
        })),
      ),
    ),
  );

  return {
    name: "Legacy Knossos schema",
    canIdLayout: knossos.canIdLayout,
    payloadHeader: knossos.payloadHeader,
    messageDefinitions,
    errors: knossos.errors,
    error: {
      field: "message_good",
      goodValue: 1,
      byteOffset: 2,
      byteLength: 4,
      byteOrder: "little",
      values: knossos.errors,
    },
  };
}

function schemaLayoutFromCanLayout(layout: CanIdLayoutDef | undefined) {
  return layout
    ? {
        bitLength: layout.bitLength,
        fields: layout.fields,
      }
    : undefined;
}

function defaultCanIdLayout(profile: CanProfile) {
  return profile.defaultCanIdLayoutId ? profile.canIdLayouts?.[profile.defaultCanIdLayoutId] : Object.values(profile.canIdLayouts ?? {})[0];
}

function resolveSchema(profile: CanProfile): ResolvedMessageSchema | undefined {
  const schema = getProfileMessageSchema(profile);
  if (schema) {
    const canIdLayout = schema.canIdLayout ?? schemaLayoutFromCanLayout(defaultCanIdLayout(profile));
    return canIdLayout ? { ...schema, canIdLayout } : undefined;
  }
  if (profile.knossos) return schemaFromKnossos(profile.knossos);
  return undefined;
}

function decodeWithSchema(profile: CanProfile, schema: ResolvedMessageSchema, frame: WsFrame): DecodedFrame {
  const bytes = bytesFromHex(frame.data_hex);
  const byteOrder = profile.byteOrder ?? "little";
  const canIdFields = (schema.canIdLayout.fields ?? []).map((field) =>
    decodeCanIdField(frame.id, field, schema.canIdLayout.enums?.[field.name]),
  );
  const canValues = valuesByName(canIdFields);
  const candidateDefinitions = schema.messageDefinitions.filter((item) => canIdMatch(item, canValues));

  if (!candidateDefinitions.length) {
    return {
      serviceIdentifier: canValues.service_identifier,
      sourceAddress: canValues.source_address,
      destinationAddress: canValues.destination_address,
      commandClass: canIdFields.find((field) => field.name === "command_class")?.displayValue,
      canIdFields,
      payloadFields: [],
      fields: canIdFields,
      requiresSchema: true,
      meaning: "CAN ID does not match this profile",
    };
  }

  const headerFields: DecodedField[] = [];
  const schemaContext: Record<string, number> = {};
  for (const field of schema.payloadHeader?.fields ?? []) {
    const decoded = decodePayloadField(bytes, field, byteOrder, schemaContext);
    headerFields.push(decoded);
    schemaContext[decoded.name] = decoded.physical;
  }
  const headerValues = valuesByName(headerFields);
  const route = candidateDefinitions.find((item) => payloadHeaderMatch(item, headerValues));
  const serviceName = route?.serviceName ?? candidateDefinitions[0]?.serviceName;
  const displayedCanIdFields = applyDisplayOverrides(canIdFields, {
    service_identifier: serviceName,
  });
  const displayedHeaderFields = route
    ? applyDisplayOverrides(headerFields, {
        instance_index: route.instanceName,
        attribute_address: route.attributeName,
        feature_index: route.featureName,
      })
    : headerFields;
  const displayedHeaderByName = Object.fromEntries(displayedHeaderFields.map((field) => [field.name, field]));
  for (const field of canIdFields) {
    schemaContext[field.name] = field.physical;
  }
  const routeFields: DecodedField[] = [];
  for (const field of route?.payloadFields ?? []) {
    const decoded = decodePayloadField(bytes, field, byteOrder, schemaContext);
    routeFields.push(decoded);
    schemaContext[decoded.name] = decoded.physical;
  }
  const payloadFields = [...displayedHeaderFields, ...routeFields];
  const fields = [...displayedCanIdFields, ...payloadFields];

  const errorConfig = schema.error;
  const errorFieldValue = errorConfig?.field ? headerValues[errorConfig.field] ?? canValues[errorConfig.field] : undefined;
  const messageGood = errorConfig?.goodValue != null && errorFieldValue != null ? matchesExpected(errorFieldValue, errorConfig.goodValue) : undefined;
  const errorByteLength = errorConfig?.byteLength ?? 4;
  const errorByteOffset = errorConfig?.byteOffset ?? 0;
  const hasEnoughErrorBytes = bytes.length >= errorByteOffset + errorByteLength;
  const hasError =
    route && errorConfig && errorFieldValue != null && hasEnoughErrorBytes
      ? errorConfig.badValue != null
        ? matchesExpected(errorFieldValue, errorConfig.badValue)
        : messageGood === false
      : false;
  const errorCode =
    hasError && errorConfig
      ? readInteger(bytes, errorByteOffset, errorByteLength, errorConfig.byteOrder ?? byteOrder)
      : undefined;
  const errorText = errorCode != null ? errorConfig?.values?.[String(errorCode)] ?? schema.errors?.[String(errorCode)] : undefined;
  const decodedErrorCode = errorCode === 0 && !errorText ? undefined : errorCode;

  return {
    frameName: route?.id ?? route?.name,
    commandClass: canIdFields.find((field) => field.name === "command_class")?.displayValue,
    sourceAddress: canValues.source_address,
    destinationAddress: canValues.destination_address,
    serviceName: route?.serviceName,
    serviceIdentifier: canValues.service_identifier,
    instanceName: route?.instanceName ?? displayedHeaderByName.instance_index?.meaning,
    instanceIndex: headerValues.instance_index,
    attributeName: route?.attributeName,
    attributeAddress: headerValues.attribute_address,
    featureName: route?.featureName,
    featureIndex: headerValues.feature_index,
    messageGood,
    errorCode: decodedErrorCode,
    errorText,
    canIdFields: displayedCanIdFields,
    payloadFields,
    fields,
    requiresSchema: !route,
    meaning: route?.meaning ?? route?.label ?? route?.id ?? route?.name ?? "Unmatched message definition",
  };
}

function decodeGeneric(profile: CanProfile, frame: WsFrame): DecodedFrame {
  const frameEntry = Object.entries(profile.frames).find(([, def]) => def.canId === frame.id);
  const bytes = bytesFromHex(frame.data_hex);
  const defaultCanIdLayout = profile.defaultCanIdLayoutId
    ? profile.canIdLayouts?.[profile.defaultCanIdLayoutId]
    : Object.values(profile.canIdLayouts ?? {})[0];
  const canIdFields = (defaultCanIdLayout?.fields ?? []).map((field) => decodeCanIdField(frame.id, field));

  if (!frameEntry) {
    return {
      canIdFields,
      payloadFields: [],
      fields: canIdFields,
      meaning: canIdFields.length ? "CAN ID fields decoded; no message payload profile matches this CAN ID" : "No profile message matches this CAN ID",
      requiresSchema: true,
    };
  }

  const [frameName, def] = frameEntry;
  const payloadFields = def.signals.map((signal) => decodeSignal(bytes, signal, profile.byteOrder ?? "little"));
  const fields = [...canIdFields, ...payloadFields];

  return {
    frameName,
    canIdFields,
    payloadFields,
    fields,
    meaning: fields.length ? `Decoded ${fields.length} fields from ${frameName}` : `${frameName} has no fields`,
  };
}

export function decodeFrameWithProfile(profile: CanProfile | null, frame: WsFrame): DecodedFrame | null {
  if (!profile) return null;

  const schema = resolveSchema(profile);
  if (schema) return decodeWithSchema(profile, schema, frame);

  return decodeGeneric(profile, frame);
}

export function decodeFrameWithProfiles(profiles: CanProfile[], frame: WsFrame): DecodedFrame | null {
  let fallback: DecodedFrame | null = null;

  for (const profile of profiles) {
    const decoded = decodeFrameWithProfile(profile, frame);
    if (!decoded) continue;
    if (!fallback) fallback = decoded;
    if (!decoded.requiresSchema) return decoded;
  }

  return fallback;
}
