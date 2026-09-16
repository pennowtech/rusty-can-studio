import { decodeFieldListRich, resolveVariantCandidate, discriminatorKey, type FieldSpec } from "@sbt/desktop-kit/utils/jsonStructCodec";
import type { WsFrame } from "@/can-bridge/ws/types";
import type { CanonicalField, CanonicalProfile, CanonicalVariant } from "@/profile-editor/model/canonicalProfile";

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
  // Kept as the concatenation of payloadCommonFields + payloadVariantFields
  // for callers that just want "everything decoded from the payload" (the
  // profile-editor's DecodedPreviewPanel groups by canId/payload today).
  payloadDecodedFields: DecodedField[];
  // Decoded once from profile.payload.common — small, stable across every
  // variant in the profile (e.g. attribute_address/feature_index in the k2
  // profiles). The "columns" view reads this, not payloadVariantFields,
  // since a variant's own field count can run into the dozens.
  payloadCommonFields: DecodedField[];
  // Decoded from whichever variant's own payload.fields matched.
  payloadVariantFields: DecodedField[];
  fields: DecodedField[];
  meaning: string;
  requiresSchema?: boolean;
  rawCanId: number;
  rawPayloadHex: string;
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

function bitMaskFor(length: number) {
  return length >= 32 ? 0xffffffff : 2 ** length - 1;
}

function formatPhysical(value: number, unit?: string) {
  const text = Number.isInteger(value) ? value.toString() : value.toFixed(3);
  return unit ? `${text} ${unit}` : text;
}

function decodedDisplay(physical: number, unit: string | undefined, meaning: string | undefined) {
  return meaning ?? formatPhysical(physical, unit);
}

function extractFromCanId(id: number, field: CanonicalField) {
  if (field.name === "can_id") return id & bitMaskFor(field.bitLength);
  return Math.floor(id / 2 ** field.startBit) & bitMaskFor(field.bitLength);
}

function signedValue(raw: number, bitLength: number) {
  if (bitLength <= 0) return raw;
  const signBit = 2 ** (bitLength - 1);
  return raw >= signBit ? raw - 2 ** bitLength : raw;
}

function extractFromBytes(bytes: number[], field: { startBit: number; bitLength: number }, byteOrder: "little" | "big") {
  let raw = 0;
  if (byteOrder === "little") {
    for (let i = 0; i < field.bitLength; i++) raw += getPayloadBit(bytes, field.startBit + i) * 2 ** i;
    return raw;
  }
  for (let i = 0; i < field.bitLength; i++) raw = raw * 2 + getPayloadBit(bytes, field.startBit + i);
  return raw;
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
  if (!isSafeExpression(expression, new Set(names))) return undefined;
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

function fieldNumericValue(raw: number, field: CanonicalField | { type?: string; bitLength: number }) {
  return field.type === "int" ? signedValue(raw, field.bitLength) : raw;
}

function decodeCanIdField(id: number, field: CanonicalField, profile: CanonicalProfile): DecodedField {
  const extracted = extractFromCanId(id, field);
  const raw = fieldNumericValue(extracted, field);
  const dictionaryId = field.dictionary ?? field.name;
  const meaning = profile.dictionaries?.[dictionaryId]?.[String(raw)];
  return {
    name: field.name,
    raw,
    physical: raw,
    displayValue: decodedDisplay(raw, undefined, meaning),
    startBit: field.startBit,
    length: field.bitLength,
    source: "canId",
    meaning,
  };
}

// Expands one CanonicalField into the shared codec's FieldSpec shape — one
// entry normally, `count` entries (each with its own explicit startBit,
// named "name[i]") for a repeated/strided field. count/strideBits has no
// equivalent in the shared codec (CAN-specific batch-telemetry pattern, not
// something FlexMQTT's format needs), so it's expanded here rather than
// pushed into @sbt/desktop-kit. `dictionary` always resolves to something
// (falls back to the field's own name) to preserve the exact lookup
// convention every CanonicalField reader already relies on. `bitOrder`
// always follows the profile's own `bus.byteOrder` — CAN payload fields use
// Intel (`'little'`) bit numbering almost universally; the shared codec's
// `readBits` silently produces a wrong value for any multi-byte field if
// this isn't threaded through (confirmed against a real 16-bit field: 2067.5
// instead of the correct 5000 when left at the codec's 'big' default).
function toFieldSpecs(field: CanonicalField, byteOrder: "little" | "big"): FieldSpec[] {
  const count = Math.max(1, Math.floor(field.count ?? 1));
  const stride = field.strideBits ?? field.bitLength;
  return Array.from({ length: count }, (_, index) => ({
    name: count > 1 ? `${field.name}[${index}]` : field.name,
    startBit: field.startBit + index * stride,
    bitLength: field.bitLength,
    bitOrder: byteOrder,
    signed: field.type === "int",
    scale: field.factor,
    offset: field.offset,
    unit: field.unit,
    dictionary: field.dictionary ?? field.name,
  }));
}

// Decodes a whole CanonicalField[] list (profile.payload.common.fields, or
// a matched variant's payload.fields) via the shared codec's field-decode
// primitive, then layers back the two things that stay Rusty-native:
// Rusty's own (more permissive, string-capable) `display.expression`
// evaluator — re-run over the shared decode's result rather than passed
// into the shared codec's own `expr`, since that's numeric-only and this
// mechanism has no real-world usage to risk breaking — and the
// context-threading (`putDecodedValue`-equivalent) every existing caller
// downstream (variant matching, error rules) already depends on.
function decodeFieldGroup(
  bytes: number[],
  fields: CanonicalField[],
  byteOrder: "little" | "big",
  profile: CanonicalProfile,
  context: Record<string, number>,
): DecodedField[] {
  const specs = fields.flatMap((field) => toFieldSpecs(field, byteOrder));
  const byBaseName = new Map(fields.map((field) => [field.name, field]));
  const bytesArray = new Uint8Array(bytes);
  const { values, fields: rich } = decodeFieldListRich(bytesArray, specs, {
    byteOrder,
    dictionaries: profile.dictionaries,
  });

  const decoded: DecodedField[] = [];
  for (const structField of rich) {
    const baseName = structField.name.replace(/\[\d+]$/, "");
    const source = byBaseName.get(baseName);
    let physical = structField.physical as number;
    let displayValue = structField.displayValue;
    if (typeof structField.raw === "number" && source?.display?.expression) {
      const expressionValue = evaluateExpression(source.display.expression, { ...context, ...(values as Record<string, number>), raw: structField.raw, value: physical });
      if (typeof expressionValue === "number") {
        physical = expressionValue;
        displayValue = decodedDisplay(physical, structField.unit, structField.meaning);
      } else if (typeof expressionValue === "string") {
        displayValue = expressionValue;
      }
    }
    const field: DecodedField = {
      name: structField.name,
      raw: typeof structField.raw === "number" ? structField.raw : 0,
      physical,
      displayValue,
      unit: structField.unit,
      startBit: structField.startBit,
      length: structField.length,
      source: "payload",
      meaning: structField.meaning,
    };
    decoded.push(field);
    putDecodedValue(context, field);
  }
  return decoded;
}

function putDecodedValue(context: Record<string, number>, field: DecodedField) {
  context[field.name] = field.physical;
}

function valuesByName(fields: DecodedField[]) {
  return Object.fromEntries(fields.map((field) => [field.name, field.raw]));
}

function expressionErrorState(expression: string, values: Record<string, number>) {
  const notEqual = expression.match(/^\s*([A-Za-z_]\w*)\s*!=\s*(.+?)\s*$/);
  if (notEqual) {
    const [, field, rawExpected] = notEqual;
    const expected = Number(rawExpected);
    return Number.isFinite(expected) ? values[field] !== expected : String(values[field]) !== rawExpected.replace(/^["']|["']$/g, "");
  }
  const equal = expression.match(/^\s*([A-Za-z_]\w*)\s*==\s*(.+?)\s*$/);
  if (equal) {
    const [, field, rawExpected] = equal;
    const expected = Number(rawExpected);
    return Number.isFinite(expected) ? values[field] === expected : String(values[field]) === rawExpected.replace(/^["']|["']$/g, "");
  }
  return Boolean(evaluateExpression(expression, values));
}

function decodeCanonical(profile: CanonicalProfile, frame: WsFrame): DecodedFrame {
  const bytes = bytesFromHex(frame.data_hex);
  const byteOrder = profile.bus.byteOrder;
  const canIdFields = profile.layouts.canId.fields.map((field) => decodeCanIdField(frame.id, field, profile));
  const canValues = valuesByName(canIdFields);
  canValues.can_id = frame.id;

  const context: Record<string, number> = { ...canValues };
  const commonFields = decodeFieldGroup(bytes, profile.payload.common?.fields ?? [], byteOrder, profile, context);

  const identificationValues = { ...canValues, ...context };
  const key = discriminatorKey(profile.payload.discriminator, identificationValues);
  const variant: CanonicalVariant | undefined = resolveVariantCandidate(profile.payload.variants[key], identificationValues);

  if (!variant) {
    return {
      serviceIdentifier: canValues.service_identifier,
      serviceName: canIdFields.find((field) => field.name === "service_identifier")?.meaning,
      sourceAddress: canValues.source_address,
      destinationAddress: canValues.destination_address,
      commandClass: canIdFields.find((field) => field.name === "command_class")?.displayValue,
      canIdFields,
      payloadDecodedFields: commonFields,
      payloadCommonFields: commonFields,
      payloadVariantFields: [],
      fields: [...canIdFields, ...commonFields],
      requiresSchema: true,
      meaning: commonFields.length ? "No payload variant matches this frame" : "CAN ID does not match this profile",
      rawCanId: frame.id,
      rawPayloadHex: frame.data_hex,
    };
  }

  const variantFields = decodeFieldGroup(bytes, variant.payload.fields ?? [], byteOrder, profile, context);
  const payloadValues = Object.fromEntries(variantFields.map((field) => [field.name, field.physical]));

  const payloadDecodedFields = [...commonFields, ...variantFields];
  const fields = [...canIdFields, ...payloadDecodedFields];
  const allValues = { ...identificationValues, ...context, ...payloadValues };
  const errorRule = profile.errors?.find((rule) => expressionErrorState(rule.when, allValues));
  const extractedErrorCode = errorRule ? extractFromBytes(bytes, errorRule.source, errorRule.source.byteOrder ?? byteOrder) : undefined;
  const errorCode = errorRule && extractedErrorCode != null ? fieldNumericValue(extractedErrorCode, errorRule.source) : undefined;
  const errorText = errorRule?.dictionary && errorCode != null ? profile.dictionaries?.[errorRule.dictionary]?.[String(errorCode)] : undefined;
  const messageGoodField = fields.find((field) => field.name === "message_good");

  return {
    frameName: variant.id,
    commandClass: canIdFields.find((field) => field.name === "command_class")?.displayValue,
    sourceAddress: canValues.source_address,
    destinationAddress: canValues.destination_address,
    serviceIdentifier: canValues.service_identifier,
    serviceName: fields.find((field) => field.name === "service_identifier")?.meaning,
    instanceName: fields.find((field) => field.name === "instance_index")?.meaning,
    instanceIndex: context.instance_index,
    attributeName: fields.find((field) => field.name === "attribute_address")?.meaning,
    attributeAddress: context.attribute_address,
    featureName: fields.find((field) => field.name === "feature_index")?.meaning,
    featureIndex: context.feature_index,
    messageGood: messageGoodField ? Boolean(messageGoodField.raw) : undefined,
    errorCode,
    errorText,
    canIdFields,
    payloadDecodedFields,
    payloadCommonFields: commonFields,
    payloadVariantFields: variantFields,
    fields,
    requiresSchema: false,
    meaning: variant.label ?? variant.id,
    rawCanId: frame.id,
    rawPayloadHex: frame.data_hex,
  };
}

export function decodeFrameWithProfile(profile: CanonicalProfile | null, frame: WsFrame): DecodedFrame | null {
  if (!profile) return null;
  return decodeCanonical(profile, frame);
}

export function decodeFrameWithProfiles(profiles: CanonicalProfile[], frame: WsFrame): DecodedFrame | null {
  let fallback: DecodedFrame | null = null;
  for (const profile of profiles) {
    const decoded = decodeFrameWithProfile(profile, frame);
    if (!decoded) continue;
    if (!fallback) fallback = decoded;
    if (!decoded.requiresSchema) return decoded;
  }
  return fallback;
}
