import { describe, it, expect } from "vitest";
import type { CanProfile } from "@/profile-editor/model/profile";
import { createDerivedField } from "@/utils/derivedFieldUtils";

describe("createDerivedField", () => {
  it("creates expression-based derived field when no signals exist", () => {
    const profile = {
      meta: { name: "Test", version: "1.0" },
      frames: {}, //  no frames
      derivedFields: {},
      columns: [],
    } as unknown as CanProfile;

    const result = createDerivedField(profile);

    expect(result.derivedField.source).toBe("expression");
    expect(result.derivedField.expr).toBe("");
    expect(result.derivedField.signalId).toBeUndefined();
  });
  it("creates signal-based derived field when signals exist", () => {
    const profile = {
      meta: { name: "Test", version: "1.0" },
      frames: {
        "0x123": {
          id: "0x123",
          signals: {
            speed: {
              id: "speed",
              name: "Speed",
              startByte: 0,
              length: 1,
              byteOrder: "little",
              factor: 1,
              offset: 0,
            },
          },
        },
      },
      derivedFields: {},
      columns: [],
    } as unknown as CanProfile;

    const result = createDerivedField(profile);

    expect(result.derivedField.source).toBe("signal");
    expect(result.derivedField.signalId).toBe("speed");
    expect(result.derivedField.expr).toBeUndefined();
  });
});
