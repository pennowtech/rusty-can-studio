import { describe, expect, it } from "vitest";

import { parseCandump } from "@/can/candump";
import { decodeFrameWithProfiles } from "@/profile-editor/decodeProfile";
import type { CanonicalProfile } from "@/profile-editor/model/canonicalProfile";
import type { CanProfile } from "@/profile-editor/model/profile";

function decodedMap(decoded: NonNullable<ReturnType<typeof decodeFrameWithProfiles>>) {
  return Object.fromEntries(decoded.fields.map((field) => [field.name, field.displayValue]));
}

describe("profile decoding across unrelated CAN-FD formats", () => {
  it("decodes the canonical motor profile shape directly", () => {
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
            { name: "can_id", startBit: 0, bitLength: 11, type: "uint" },
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

  it("decodes the canonical J1939 profile shape directly", () => {
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

  it("decodes a generic exact-CAN-ID motor status profile", () => {
    const profile: CanProfile = {
      meta: { name: "Motor Controller Generic", version: "1.0.0" },
      byteOrder: "little",
      canIdLayouts: {
        standard11: {
          id: "standard11",
          name: "Standard 11-bit ID",
          format: "standard",
          bitLength: 11,
          fields: [
            { name: "node_id", startBit: 0, length: 7 },
            { name: "message_class", startBit: 7, length: 4 },
          ],
        },
      },
      defaultCanIdLayoutId: "standard11",
      frames: {
        motor_status: {
          canId: 0x321,
          canIdLayout: "standard11",
          signals: [
            { name: "rpm", startByte: 0, length: 2, factor: 0.25, unit: "rpm" },
            { name: "temperature", startByte: 2, length: 1, offset: -40, unit: "degC" },
            { name: "enabled", startByte: 3, length: 1, bitLength: 1 },
          ],
        },
      },
      fieldTypes: {},
      derivedFields: [],
      columns: [],
    };
    const [frame] = parseCandump("(000.000000) can0 321 [08] 20 4E 64 01 00 00 00 00");
    const decoded = decodeFrameWithProfiles([profile], frame);

    expect(decoded?.frameName).toBe("motor_status");
    expect(decodedMap(decoded!)).toMatchObject({
      node_id: "33",
      message_class: "6",
      rpm: "5000 rpm",
      temperature: "60 degC",
      enabled: "1",
    });
  });

  it("decodes a compact service/header schema profile", () => {
    const profile: CanProfile = {
      meta: { name: "Compact Service Example", version: "1.0.0" },
      byteOrder: "little",
      protocol: "schema",
      canIdLayoutRef: "service29",
      canIdLayouts: {
        service29: {
          id: "service29",
          name: "Service 29-bit ID",
          format: "extended",
          bitLength: 29,
          fields: [
            { name: "service_identifier", startBit: 0, length: 10 },
            { name: "source_address", startBit: 13, length: 6 },
            { name: "destination_address", startBit: 19, length: 6 },
            {
              name: "command_class",
              startBit: 26,
              length: 4,
              values: { "6": "command", "5": "response", "3": "event" },
            },
          ],
        },
      },
      service: { name: "compact_light", identifier: 0x321 },
      payloadHeader: {
        lengthBytes: 2,
        fields: [
          { name: "attribute_address", byte: 0, startBit: 1, length: 7 },
          { name: "message_good", byte: 0, startBit: 0, length: 1, values: { "0": "bad", "1": "good" } },
          { name: "feature_index", byte: 1, startBit: 0, length: 4 },
        ],
      },
      attributes: [
        {
          name: "brightness",
          address: 5,
          operations: [
            {
              type: "set_current_value",
              featureIndex: 2,
              variants: {
                command: [{ name: "brightness_raw", byte: 2, startBit: 0, length: 16, unit: "permille" }],
              },
            },
          ],
        },
      ],
      errorStatus: { field: "message_good", goodValue: 1, byteOffset: 2, byteLength: 4, byteOrder: "little" },
      frames: {},
      fieldTypes: {},
      derivedFields: [],
      columns: [],
    };
    const [frame] = parseCandump("(000.000000) can0 18000321 [04] 0B 02 E8 03");
    const decoded = decodeFrameWithProfiles([profile], frame);

    expect(decoded?.requiresSchema).toBeFalsy();
    expect(decoded?.meaning).toBe("compact_light.brightness.set_current_value.command");
    expect(decodedMap(decoded!)).toMatchObject({
      service_identifier: "compact_light",
      command_class: "command",
      attribute_address: "brightness",
      feature_index: "set_current_value.command",
      brightness_raw: "1000 permille",
    });
  });

  it("decodes a J1939-style extended ID and payload", () => {
    const profile: CanProfile = {
      meta: { name: "J1939 Engine Snapshot", version: "1.0.0" },
      byteOrder: "little",
      messageSchema: {
        name: "j1939",
        canIdLayout: {
          bitLength: 29,
          fields: [
            { name: "source_address", startBit: 0, length: 8 },
            { name: "pgn", startBit: 8, length: 18 },
            { name: "priority", startBit: 26, length: 3 },
          ],
        },
        payloadHeader: { lengthBytes: 0, fields: [] },
        messageDefinitions: [
          {
            id: "j1939.engine_speed",
            label: "Engine Speed",
            match: { canId: { pgn: 0xf004 } },
            payloadFields: [
              { name: "engine_speed", byte: 3, startBit: 0, length: 16, factor: 0.125, unit: "rpm" },
              { name: "actual_torque", byte: 2, startBit: 0, length: 8, offset: -125, unit: "%" },
            ],
          },
        ],
      },
      canIdLayouts: {},
      frames: {},
      fieldTypes: {},
      derivedFields: [],
      columns: [],
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

  it("decodes a UDS-style diagnostic request with byte header fields", () => {
    const profile: CanProfile = {
      meta: { name: "UDS Diagnostic Request", version: "1.0.0" },
      byteOrder: "little",
      messageSchema: {
        name: "uds",
        canIdLayout: {
          bitLength: 29,
          fields: [
            { name: "target_address", startBit: 8, length: 8 },
            { name: "source_address", startBit: 0, length: 8 },
            { name: "addressing_type", startBit: 24, length: 5 },
          ],
        },
        payloadHeader: {
          lengthBytes: 2,
          fields: [
            { name: "payload_length", byte: 0, startBit: 0, length: 8 },
            { name: "service_id", byte: 1, startBit: 0, length: 8, values: { "34": "ReadDataByIdentifier" } },
          ],
        },
        messageDefinitions: [
          {
            id: "uds.read_data_by_identifier.request",
            label: "Read DID request",
            match: { payloadHeader: { service_id: 0x22 } },
            payloadFields: [{ name: "did", byte: 2, startBit: 0, length: 16 }],
          },
        ],
      },
      canIdLayouts: {},
      frames: {},
      fieldTypes: {},
      derivedFields: [],
      columns: [],
    };
    const [frame] = parseCandump("(000.000000) can0 18DA10F1 [08] 03 22 F1 90 00 00 00 00");
    const decoded = decodeFrameWithProfiles([profile], frame);

    expect(decoded?.meaning).toBe("Read DID request");
    expect(decodedMap(decoded!)).toMatchObject({
      addressing_type: "24",
      target_address: "16",
      source_address: "241",
      payload_length: "3",
      service_id: "ReadDataByIdentifier",
      did: "37105",
    });
  });

  it("decodes an aerospace-style custom header without leaking another profile", () => {
    const matchingProfile: CanProfile = {
      meta: { name: "Aerospace Actuator Bus", version: "1.0.0" },
      byteOrder: "little",
      messageSchema: {
        name: "actuator",
        canIdLayout: {
          bitLength: 29,
          fields: [
            { name: "bus_id", startBit: 24, length: 5 },
            { name: "message_type", startBit: 16, length: 8, values: { "90": "ActuatorStatus" } },
            { name: "node_id", startBit: 0, length: 8 },
          ],
        },
        payloadHeader: {
          lengthBytes: 2,
          fields: [
            { name: "packet_kind", byte: 0, startBit: 0, length: 4, values: { "10": "status" } },
            { name: "channel", byte: 0, startBit: 4, length: 4 },
            { name: "sequence", byte: 1, startBit: 0, length: 8 },
          ],
        },
        messageDefinitions: [
          {
            id: "actuator.status",
            label: "Actuator Status",
            match: { canId: { message_type: 0x5a }, payloadHeader: { packet_kind: 0x0a } },
            payloadFields: [
              { name: "position", byte: 2, startBit: 0, length: 16, factor: 0.01, unit: "deg" },
              { name: "current", byte: 4, startBit: 0, length: 16, factor: 0.001, unit: "A" },
            ],
          },
        ],
      },
      canIdLayouts: {},
      frames: {},
      fieldTypes: {},
      derivedFields: [],
      columns: [],
    };
    const unrelatedProfile: CanProfile = {
      meta: { name: "Unrelated Profile", version: "1.0.0" },
      byteOrder: "little",
      messageSchema: {
        name: "unrelated",
        canIdLayout: {
          bitLength: 29,
          fields: [
            { name: "message_type", startBit: 16, length: 8, values: { "1": "WrongMessage" } },
            { name: "node_id", startBit: 0, length: 8 },
          ],
        },
        payloadHeader: { lengthBytes: 0, fields: [] },
        messageDefinitions: [{ id: "unrelated.only", match: { canId: { message_type: 1 } }, payloadFields: [] }],
      },
      canIdLayouts: {},
      frames: {},
      fieldTypes: {},
      derivedFields: [],
      columns: [],
    };
    const [frame] = parseCandump("(000.000000) can0 055A0042 [08] 3A 07 10 27 88 13 00 00");
    const decoded = decodeFrameWithProfiles([unrelatedProfile, matchingProfile], frame);

    expect(decoded?.meaning).toBe("Actuator Status");
    expect(decodedMap(decoded!)).toMatchObject({
      bus_id: "5",
      message_type: "ActuatorStatus",
      node_id: "66",
      packet_kind: "status",
      channel: "3",
      sequence: "7",
      position: "100 deg",
      current: "5 A",
    });
  });
});
