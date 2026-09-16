import { describe, expect, test } from "vitest";
import { matchesExpression, parseFilterExpression, type FieldResolver } from "@sbt/desktop-kit/utils/filterExpression";

// Mirrors CanFdDashboard.tsx's own getRowField/canFilterResolver — kept as a
// local copy (rather than importing from the giant component file) so this
// test exercises the real shared engine against CAN-shaped data without
// dragging in the whole dashboard.
function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type SampleRow = { values: Record<string, string>; numericValues: Record<string, number> };

function getRowField(row: SampleRow, fieldName: string) {
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

const resolver: FieldResolver<SampleRow> = {
  resolveKnownField(row, field) {
    const found = getRowField(row, field);
    if (!found) return undefined;
    if (found.numeric !== undefined) {
      const parsedFromText = Number(found.value);
      if (Number.isFinite(parsedFromText) && parsedFromText === found.numeric) return found.numeric;
    }
    return found.value;
  },
  getJsonPayload() {
    return undefined;
  },
};

const sampleRow: SampleRow = {
  values: {
    time: "10.000",
    line: "1",
    iface: "can0",
    canId: "0x123",
    id: "0x123",
    len: "8",
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
    len: 8,
    serviceIdentifier: 16,
    service_identifier: 16,
    "canId:service_identifier": 16,
    instance_index: 1,
  },
};

describe("getRowField", () => {
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

describe("shared filterExpression engine against CAN rows", () => {
  function matches(expression: string) {
    return matchesExpression(parseFilterExpression(expression), sampleRow, resolver);
  }

  // Behavior change from the old regex-based CanFdDashboard filter: its ==
  // did fuzzy prefix/substring matching. The shared engine's == is strict
  // equality (matching FlexMQTT's semantics) — ~ is the substring operator
  // now, for filters that want the old fuzzy behavior.
  test("== is strict equality, not prefix matching", () => {
    expect(matches("instance_index == FIELD_LED")).toBe(true);
    expect(matches("instance_index == FIELD")).toBe(false);
    expect(matches("instance_index == FIELD_LE")).toBe(false);
  });

  test("~ is substring matching — the replacement for the old fuzzy ==", () => {
    expect(matches('instance_index ~ "FIELD"')).toBe(true);
    expect(matches('instance_index ~ "FIELD_LE"')).toBe(true);
  });

  test("resolves a decoded enum field (string) even though it also has a numeric code", () => {
    expect(matches("service_identifier == k2_focus_control")).toBe(true);
    expect(matches("service_identifier == 16")).toBe(false);
  });

  test("resolves a plain numeric field for ordering", () => {
    expect(matches("len > 4")).toBe(true);
    expect(matches("len > 10")).toBe(false);
  });

  test("and/or/not with correct precedence and parentheses (not available in the old parser)", () => {
    expect(matches("(instance_index == FIELD_LED or instance_index == X) and len == 8")).toBe(true);
    expect(matches("not (len > 10)")).toBe(true);
  });

  test("~= is a regex match", () => {
    expect(matches('instance_index ~= "^FIELD_[A-Z]+$"')).toBe(true);
    expect(matches('instance_index ~= "^X"')).toBe(false);
  });
});
