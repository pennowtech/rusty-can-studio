import { describe, expect, it } from "vitest";

import { parseCandump } from "@/can/candump";
import { decodeFrameWithProfiles } from "@/profile-editor/decodeProfile";
import type { CanonicalProfile } from "@/profile-editor/model/canonicalProfile";

function decodedMap(decoded: NonNullable<ReturnType<typeof decodeFrameWithProfiles>>) {
  return Object.fromEntries(decoded.fields.map((field) => [field.name, field.displayValue]));
}

describe("canonical profile decoding across unrelated CAN-FD formats", () => {
  it("decodes a standard-ID motor profile", () => {
    const profile: CanonicalProfile = {
      schemaVersion: "1.0",
      meta: { id: "motor_generic", name: "Motor Controller Generic", version: "1.0.0" },
      bus: { type: "can", idFormat: "standard", byteOrder: "little" },
      layouts: {
        canId: {
          label: "Standard 11-bit ID",
          bitLength: 11,
          fields: [
            { name: "node_id", startBit: 0, bitLength: 7, type: "uint" },
            { name: "message_class", startBit: 7, bitLength: 4, type: "uint" },
          ],
        },
      },
      messages: [
        {
          id: "motor_status",
          label: "Motor Status",
          identifyBy: { can_id: 0x321 },
          payload: {
            bitLength: 32,
            fields: [
              { name: "rpm", startBit: 0, bitLength: 16, type: "uint", factor: 0.25, unit: "rpm" },
              { name: "temperature", startBit: 16, bitLength: 8, type: "uint", offset: -40, unit: "degC" },
              { name: "enabled", startBit: 24, bitLength: 1, type: "bool" },
            ],
          },
        },
      ],
    };
    const [frame] = parseCandump("(000.000000) can0 321 [08] 20 4E 64 01 00 00 00 00");
    const decoded = decodeFrameWithProfiles([profile], frame);

    expect(decoded?.meaning).toBe("Motor Status");
    expect(decodedMap(decoded!)).toMatchObject({
      node_id: "33",
      message_class: "6",
      rpm: "5000 rpm",
      temperature: "60 degC",
      enabled: "1",
    });
  });

  it("decodes an extended-ID J1939-style profile", () => {
    const profile: CanonicalProfile = {
      schemaVersion: "1.0",
      meta: { id: "j1939_engine", name: "J1939 Engine Snapshot", version: "1.0.0" },
      bus: { type: "can", idFormat: "extended", byteOrder: "little" },
      layouts: {
        canId: {
          label: "J1939 29-bit ID",
          bitLength: 29,
          fields: [
            { name: "source_address", startBit: 0, bitLength: 8, type: "uint" },
            { name: "pgn", startBit: 8, bitLength: 18, type: "uint" },
            { name: "priority", startBit: 26, bitLength: 3, type: "uint" },
          ],
        },
      },
      messages: [
        {
          id: "j1939.engine_speed",
          label: "Engine Speed",
          identifyBy: { pgn: 0xf004 },
          payload: {
            bitLength: 64,
            fields: [
              { name: "actual_torque", startBit: 16, bitLength: 8, type: "uint", offset: -125, unit: "%" },
              { name: "engine_speed", startBit: 24, bitLength: 16, type: "uint", factor: 0.125, unit: "rpm" },
            ],
          },
        },
      ],
    };
    const [frame] = parseCandump("(000.000000) can0 0CF00401 [08] FF FF 7D 20 4E FF FF FF");
    const decoded = decodeFrameWithProfiles([profile], frame);

    expect(decoded?.meaning).toBe("Engine Speed");
    expect(decodedMap(decoded!)).toMatchObject({
      priority: "3",
      pgn: "61444",
      source_address: "1",
      actual_torque: "0 %",
      engine_speed: "2500 rpm",
    });
  });

  it("uses dictionaries and error rules from canonical profile data", () => {
    const profile: CanonicalProfile = {
      schemaVersion: "1.0",
      meta: { id: "service_profile", name: "Service Profile", version: "1.0.0" },
      bus: { type: "can-fd", idFormat: "extended", byteOrder: "little" },
      layouts: {
        canId: {
          bitLength: 29,
          fields: [
            { name: "service_identifier", startBit: 0, bitLength: 10, type: "enum", dictionary: "service_identifier" },
            { name: "command_class", startBit: 26, bitLength: 4, type: "enum", dictionary: "command_class" },
          ],
        },
        payloadHeader: {
          bitLength: 16,
          fields: [
            { name: "message_good", startBit: 0, bitLength: 1, type: "enum", dictionary: "message_good" },
            { name: "attribute_address", startBit: 1, bitLength: 7, type: "enum", dictionary: "attribute_address" },
            { name: "feature_index", startBit: 8, bitLength: 4, type: "uint" },
          ],
        },
      },
      dictionaries: {
        service_identifier: { "810": "light" },
        command_class: { "5": "response" },
        message_good: { "0": "bad", "1": "good" },
        attribute_address: { "3": "on_off_cycles" },
        error_status: { "12": "ERROR_AXIS_POSITION_NOT_REACHED" },
      },
      messages: [
        {
          id: "light.on_off_cycles.response",
          label: "on_off_cycles response",
          identifyBy: { service_identifier: 810, command_class: 5, attribute_address: 3, feature_index: 1 },
          payload: { bitLength: 48, fields: [] },
        },
      ],
      errors: [
        {
          id: "default_error_status",
          when: "message_good != 1",
          source: { startBit: 16, bitLength: 32, type: "uint", byteOrder: "little" },
          dictionary: "error_status",
          display: "Error ${raw}: ${text}",
        },
      ],
    };
    const [frame] = parseCandump("(000.000000) can0 1400032A [06] 06 01 0C 00 00 00");
    const decoded = decodeFrameWithProfiles([profile], frame);

    expect(decoded?.meaning).toBe("on_off_cycles response");
    expect(decoded?.errorCode).toBe(12);
    expect(decoded?.errorText).toBe("ERROR_AXIS_POSITION_NOT_REACHED");
    expect(decodedMap(decoded!)).toMatchObject({
      service_identifier: "light",
      command_class: "response",
      attribute_address: "on_off_cycles",
      message_good: "bad",
    });
  });

  it("does not decode unrelated profile message data", () => {
    const matchingProfile: CanonicalProfile = {
      schemaVersion: "1.0",
      meta: { id: "actuator", name: "Actuator", version: "1.0.0" },
      bus: { type: "can-fd", idFormat: "extended", byteOrder: "little" },
      layouts: {
        canId: {
          bitLength: 29,
          fields: [
            { name: "message_type", startBit: 16, bitLength: 8, type: "enum", dictionary: "message_type" },
            { name: "node_id", startBit: 0, bitLength: 8, type: "uint" },
          ],
        },
        payloadHeader: {
          bitLength: 16,
          fields: [{ name: "packet_kind", startBit: 0, bitLength: 4, type: "enum", dictionary: "packet_kind" }],
        },
      },
      dictionaries: { message_type: { "90": "ActuatorStatus" }, packet_kind: { "10": "status" } },
      messages: [
        {
          id: "actuator.status",
          label: "Actuator Status",
          identifyBy: { message_type: 90, packet_kind: 10 },
          payload: { bitLength: 48, fields: [{ name: "position", startBit: 16, bitLength: 16, type: "uint", factor: 0.01, unit: "deg" }] },
        },
      ],
    };
    const unrelatedProfile: CanonicalProfile = {
      schemaVersion: "1.0",
      meta: { id: "unrelated", name: "Unrelated", version: "1.0.0" },
      bus: { type: "can-fd", idFormat: "extended", byteOrder: "little" },
      layouts: {
        canId: {
          bitLength: 29,
          fields: [{ name: "message_type", startBit: 16, bitLength: 8, type: "enum", dictionary: "message_type" }],
        },
      },
      dictionaries: { message_type: { "1": "WrongMessage" } },
      messages: [{ id: "unrelated.only", label: "Wrong", identifyBy: { message_type: 1 }, payload: { bitLength: 0, fields: [] } }],
    };
    const [frame] = parseCandump("(000.000000) can0 015A0042 [08] 0A 11 10 27 20 03 00 00");
    const decoded = decodeFrameWithProfiles([unrelatedProfile, matchingProfile], frame);

    expect(decoded?.meaning).toBe("Actuator Status");
    expect(decoded?.frameName).toBe("actuator.status");
    expect(decodedMap(decoded!)).toMatchObject({
      message_type: "ActuatorStatus",
      packet_kind: "status",
      position: "100 deg",
    });
  });

  it("honors identifyWhen when equality keys are not enough", () => {
    const profile: CanonicalProfile = {
      schemaVersion: "1.0",
      meta: { id: "conditional", name: "Conditional messages", version: "1.0.0" },
      bus: { type: "can-fd", idFormat: "standard", byteOrder: "little" },
      layouts: {
        canId: {
          bitLength: 11,
          fields: [{ name: "can_id", startBit: 0, bitLength: 11, type: "uint" }],
        },
        payloadHeader: {
          bitLength: 8,
          fields: [{ name: "mode", startBit: 0, bitLength: 8, type: "uint" }],
        },
      },
      messages: [
        {
          id: "conditional.low",
          label: "Low mode",
          identifyBy: { can_id: 0x123 },
          identifyWhen: "mode < 10",
          payload: { bitLength: 16, fields: [{ name: "low_value", startBit: 8, bitLength: 8, type: "uint" }] },
        },
        {
          id: "conditional.high",
          label: "High mode",
          identifyBy: { can_id: 0x123 },
          identifyWhen: "mode >= 10",
          payload: { bitLength: 16, fields: [{ name: "high_value", startBit: 8, bitLength: 8, type: "uint" }] },
        },
      ],
    };
    const [frame] = parseCandump("(000.000000) can0 123 [02] 0A 2A");
    const decoded = decodeFrameWithProfiles([profile], frame);

    expect(decoded?.frameName).toBe("conditional.high");
    expect(decodedMap(decoded!)).toMatchObject({ mode: "10", high_value: "42" });
  });

  it("sign-extends canonical int fields before scaling", () => {
    const profile: CanonicalProfile = {
      schemaVersion: "1.0",
      meta: { id: "signed", name: "Signed fields", version: "1.0.0" },
      bus: { type: "can", idFormat: "standard", byteOrder: "little" },
      layouts: {
        canId: {
          bitLength: 11,
          fields: [{ name: "can_id", startBit: 0, bitLength: 11, type: "uint" }],
        },
      },
      messages: [
        {
          id: "signed.sample",
          label: "Signed sample",
          identifyBy: { can_id: 0x222 },
          payload: {
            bitLength: 16,
            fields: [
              { name: "delta", startBit: 0, bitLength: 8, type: "int" },
              { name: "scaled_delta", startBit: 8, bitLength: 8, type: "int", factor: 0.5, unit: "step" },
            ],
          },
        },
      ],
    };
    const [frame] = parseCandump("(000.000000) can0 222 [02] FF FE");
    const decoded = decodeFrameWithProfiles([profile], frame);

    expect(decodedMap(decoded!)).toMatchObject({
      delta: "-1",
      scaled_delta: "-1 step",
    });
    expect(decoded?.fields.find((field) => field.name === "delta")?.raw).toBe(-1);
  });

  it("expands repeated fields using count and strideBits", () => {
    const profile: CanonicalProfile = {
      schemaVersion: "1.0",
      meta: { id: "array", name: "Array fields", version: "1.0.0" },
      bus: { type: "can-fd", idFormat: "standard", byteOrder: "little" },
      layouts: {
        canId: {
          bitLength: 11,
          fields: [{ name: "can_id", startBit: 0, bitLength: 11, type: "uint" }],
        },
      },
      messages: [
        {
          id: "array.samples",
          label: "Array samples",
          identifyBy: { can_id: 0x333 },
          payload: {
            bitLength: 32,
            fields: [{ name: "sample", startBit: 0, bitLength: 8, type: "uint", count: 4, strideBits: 8 }],
          },
        },
      ],
    };
    const [frame] = parseCandump("(000.000000) can0 333 [04] 01 02 03 04");
    const decoded = decodeFrameWithProfiles([profile], frame);

    expect(decodedMap(decoded!)).toMatchObject({
      "sample[0]": "1",
      "sample[1]": "2",
      "sample[2]": "3",
      "sample[3]": "4",
    });
  });
});
