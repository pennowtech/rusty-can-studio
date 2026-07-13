import type { WsFrame } from "@/can-bridge/ws/types";
import type { CanonicalField, CanonicalProfile } from "@/profile-editor/model/canonicalProfile";

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
  payloadDecodedFields: DecodedField[];
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

function decodeCanIdField(id: number, field: CanonicalField, profile: CanonicalProfile): DecodedField {
  const raw = extractFromCanId(id, field);
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

function decodePayloadField(bytes: number[], field: CanonicalField, byteOrder: "little" | "big", profile: CanonicalProfile, context: Record<string, number>): DecodedField {
  const raw = extractFromBytes(bytes, field, byteOrder);
  const scaled = raw * (field.factor ?? 1) + (field.offset ?? 0);
  const expressionValue = evaluateExpression(field.display?.expression, { ...context, raw, value: scaled });
  const physical = typeof expressionValue === "number" ? expressionValue : scaled;
  const dictionaryId = field.dictionary ?? field.name;
  const meaning = profile.dictionaries?.[dictionaryId]?.[String(raw)];
  const displayValue = typeof expressionValue === "string" ? expressionValue : decodedDisplay(physical, field.unit, meaning);
  return {
    name: field.name,
    raw,
    physical,
    displayValue,
    unit: field.unit,
    startBit: field.startBit,
    length: field.bitLength,
    source: "payload",
    meaning,
  };
}

function valuesByName(fields: DecodedField[]) {
  return Object.fromEntries(fields.map((field) => [field.name, field.raw]));
}

function matchesExpected(actual: number | undefined, expected: number | string | boolean | null) {
  if (expected === null) return actual == null;
  if (actual == null) return false;
  if (typeof expected === "boolean") return Boolean(actual) === expected;
  if (typeof expected === "number") return actual === expected;
  return String(actual) === expected;
}

function messageMatches(message: CanonicalProfile["messages"][number], values: Record<string, number>) {
  return Object.entries(message.identifyBy ?? {}).every(([field, expected]) => matchesExpected(values[field], expected));
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
  const candidateMessages = profile.messages.filter((message) =>
    Object.entries(message.identifyBy ?? {})
      .filter(([field]) => field in canValues || field === "can_id")
      .every(([field, expected]) => matchesExpected(canValues[field], expected)),
  );

  if (!candidateMessages.length) {
    return {
      serviceIdentifier: canValues.service_identifier,
      sourceAddress: canValues.source_address,
      destinationAddress: canValues.destination_address,
      commandClass: canIdFields.find((field) => field.name === "command_class")?.displayValue,
      canIdFields,
      payloadDecodedFields: [],
      fields: canIdFields,
      requiresSchema: true,
      meaning: "CAN ID does not match this profile",
    };
  }

  const context: Record<string, number> = { ...canValues };
  const headerFields: DecodedField[] = [];
  for (const field of profile.layouts.payloadHeader?.fields ?? []) {
    const decoded = decodePayloadField(bytes, field, byteOrder, profile, context);
    headerFields.push(decoded);
    context[decoded.name] = decoded.physical;
  }

  const headerValues = valuesByName(headerFields);
  const allIdentificationValues = { ...canValues, ...headerValues };
  const message = candidateMessages.find((item) => messageMatches(item, allIdentificationValues));

  if (!message) {
    return {
      serviceIdentifier: canValues.service_identifier,
      sourceAddress: canValues.source_address,
      destinationAddress: canValues.destination_address,
      commandClass: canIdFields.find((field) => field.name === "command_class")?.displayValue,
      canIdFields,
      payloadDecodedFields: headerFields,
      fields: [...canIdFields, ...headerFields],
      requiresSchema: true,
      meaning: "CAN ID and payload header decoded; matching message definition is missing",
    };
  }

  const payloadValues: Record<string, number> = {};
  const messageFields: DecodedField[] = [];
  for (const field of message.payload.fields ?? []) {
    const decoded = decodePayloadField(bytes, field, byteOrder, profile, context);
    messageFields.push(decoded);
    context[decoded.name] = decoded.physical;
    payloadValues[decoded.name] = decoded.physical;
  }

  const payloadDecodedFields = [...headerFields, ...messageFields];
  const fields = [...canIdFields, ...payloadDecodedFields];
  const allValues = { ...allIdentificationValues, ...payloadValues };
  const errorRule = profile.errors?.find((rule) => expressionErrorState(rule.when, allValues));
  const errorCode = errorRule ? extractFromBytes(bytes, errorRule.source, errorRule.source.byteOrder ?? byteOrder) : undefined;
  const errorText = errorRule?.dictionary && errorCode != null ? profile.dictionaries?.[errorRule.dictionary]?.[String(errorCode)] : undefined;
  const messageGoodField = fields.find((field) => field.name === "message_good");

  return {
    frameName: message.id,
    commandClass: canIdFields.find((field) => field.name === "command_class")?.displayValue,
    sourceAddress: canValues.source_address,
    destinationAddress: canValues.destination_address,
    serviceIdentifier: canValues.service_identifier,
    instanceName: fields.find((field) => field.name === "instance_index")?.meaning,
    instanceIndex: headerValues.instance_index,
    attributeName: fields.find((field) => field.name === "attribute_address")?.meaning,
    attributeAddress: headerValues.attribute_address,
    featureName: fields.find((field) => field.name === "feature_index")?.meaning,
    featureIndex: headerValues.feature_index,
    messageGood: messageGoodField ? Boolean(messageGoodField.raw) : undefined,
    errorCode,
    errorText,
    canIdFields,
    payloadDecodedFields,
    fields,
    requiresSchema: false,
    meaning: message.label ?? message.id,
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
