import { describe, expect, test } from "vitest";

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseComparableNumber(value: string) {
  const normalized = value.trim().replace(/^0x/i, "");
  if (/^0x/i.test(value.trim())) return Number.parseInt(normalized, 16);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function getRowField(row: { values: Record<string, string>; numericValues: Record<string, number> }, fieldName: string) {
  if (row.values[fieldName] !== undefined) {
    return { value: row.values[fieldName], numeric: row.numericValues[fieldName] };
  }

  const candidateKeys = Object.keys(row.values);
  const caseInsensitiveKey = candidateKeys.find((k) => k.toLowerCase() === fieldName.toLowerCase());
  if (caseInsensitiveKey) {
    return { value: row.values[caseInsensitiveKey], numeric: row.numericValues[caseInsensitiveKey] };
  }

  const wanted = normalizeKey(fieldName);
  const normalizedKey = candidateKeys.find((candidate) => normalizeKey(candidate) === wanted);
  if (normalizedKey) {
    return { value: row.values[normalizedKey], numeric: row.numericValues[normalizedKey] };
  }

  return undefined;
}

function compareFilterValue(actual: string, actualNumber: number | undefined, operator: string, expected: string) {
  const actualLower = actual.toLowerCase();
  const expectedLower = expected.toLowerCase();
  const expectedNumber = parseComparableNumber(expected);

  if (!operator || operator === "contains") {
    return actualLower.includes(expectedLower) || (actualNumber != null && expectedNumber != null && actualNumber === expectedNumber);
  }
  if (operator === "==") {
    return (
      actualLower === expectedLower ||
      actualLower.startsWith(expectedLower) ||
      actualLower.includes(expectedLower) ||
      (actualNumber != null && expectedNumber != null && actualNumber === expectedNumber)
    );
  }
  if (operator === "!=") {
    const matches = (
      actualLower === expectedLower ||
      actualLower.startsWith(expectedLower) ||
      actualLower.includes(expectedLower) ||
      (actualNumber != null && expectedNumber != null && actualNumber === expectedNumber)
    );
    return !matches;
  }

  if (actualNumber == null || expectedNumber == null) return false;
  if (operator === ">") return actualNumber > expectedNumber;
  if (operator === "<") return actualNumber < expectedNumber;
  if (operator === ">=") return actualNumber >= expectedNumber;
  if (operator === "<=") return actualNumber <= expectedNumber;
  return false;
}

describe("getRowField", () => {
  const sampleRow = {
    values: {
      time: "10.000",
      line: "1",
      iface: "can0",
      canId: "0x123",
      id: "0x123",
      serviceIdentifier: "16",
      service_identifier: "k2_focus_control",
      "canId:service_identifier": "k2_focus_control",
      instance_index: "FIELD_LED",
    },
    numericValues: {
      time: 10000,
      line: 1,
      canId: 0x123,
      id: 0x123,
      serviceIdentifier: 16,
      service_identifier: 16,
      "canId:service_identifier": 16,
      instance_index: 1,
    },
  };

  test("resolves exact field service_identifier over metadata serviceIdentifier", () => {
    const field = getRowField(sampleRow, "service_identifier");
    expect(field).toBeDefined();
    expect(field?.value).toBe("k2_focus_control");
    expect(field?.numeric).toBe(16);
  });

  test("resolves canId:service_identifier prefix field", () => {
    const field = getRowField(sampleRow, "canId:service_identifier");
    expect(field).toBeDefined();
    expect(field?.value).toBe("k2_focus_control");
  });

  test("resolves case-insensitive serviceIdentifier field", () => {
    const field = getRowField(sampleRow, "serviceIdentifier");
    expect(field).toBeDefined();
    expect(field?.value).toBe("16");
  });
});

describe("compareFilterValue partial string matching", () => {
  test("matches prefix and partial string values for instance_index == FIELD, FIELD_LE, FIELD_LED", () => {
    const actual = "FIELD_LED";
    expect(compareFilterValue(actual, undefined, "==", "FIELD")).toBe(true);
    expect(compareFilterValue(actual, undefined, "==", "FIELD_LE")).toBe(true);
    expect(compareFilterValue(actual, undefined, "==", "FIELD_LED")).toBe(true);
  });
});
