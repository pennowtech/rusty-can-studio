# Canonical Profile JSON

This document defines the profile format that the Profile Editor should use as its primary contract. Importers can read other sources such as XML, DBC, ARXML, or older app profiles, but they should convert them into this shape before the visual editor and decoder work with them.

The core idea is simple:

- every layout uses absolute bits
- every message says how it is identified
- every payload field uses the same field structure
- textual values come from dictionaries
- UI behavior comes from optional display metadata

## Top-Level Shape

```json
{
  "schemaVersion": "1.0",
  "meta": {},
  "bus": {},
  "layouts": {},
  "dictionaries": {},
  "messages": [],
  "errors": [],
  "display": {}
}
```

Required sections:

| Section | Purpose |
| --- | --- |
| `schemaVersion` | Version of this canonical profile contract. |
| `meta` | Name, id, version, source, and description. |
| `bus` | CAN/CAN-FD settings and byte order. |
| `layouts` | CAN ID layout and optional payload header layout. |
| `messages` | Message definitions, identification values, and payload fields. |

Optional sections:

| Section | Purpose |
| --- | --- |
| `dictionaries` | Numeric-to-text maps used by any field. |
| `errors` | Error extraction and display rules. |
| `display` | UI preferences for Profile Editor and CAN Monitor. |

## Unified Bit Model

Use `startBit` and `bitLength` everywhere.

Use absolute `startBit` and `bitLength` for every layout and payload field.

Examples:

```json
{ "name": "message_good", "startBit": 0, "bitLength": 1 }
```

```json
{ "name": "engine_speed", "startBit": 24, "bitLength": 16 }
```

If an importer reads `byte: 3` and `length: 2`, convert it to:

```json
{ "startBit": 24, "bitLength": 16 }
```

## Message Identification

Use `identifyBy` to say which decoded values identify a message.

```json
"identifyBy": {
  "service_identifier": 810,
  "command_class": 5,
  "attribute_address": 3,
  "feature_index": 1
}
```

This is intentionally not split into `canId` and `payloadHeader`. The field names are already unique in the profile, and the decoder knows which layout produced them.

For advanced cases, use `identifyWhen`:

```json
"identifyWhen": "pgn == 61444 && source_address != 0"
```

Use `identifyBy` first. Use `identifyWhen` only when simple equality values cannot express the message.

## Field Definition

Every CAN ID field, payload header field, payload field, and error source uses the same bit-coordinate idea.

```json
{
  "name": "temperature",
  "label": "Temperature",
  "startBit": 16,
  "bitLength": 8,
  "type": "uint",
  "offset": -40,
  "unit": "degC"
}
```

Supported field properties:

| Property | Purpose |
| --- | --- |
| `name` | Stable machine name. Use snake_case. |
| `label` | Human-readable UI label. |
| `note` | Optional help text. |
| `startBit` | Absolute bit offset inside CAN ID, payload header, or payload. |
| `bitLength` | Number of bits to read. |
| `type` | `uint`, `int`, `bool`, `enum`, `bytes`, or `string`. |
| `dictionary` | Dictionary id for textual display. |
| `factor` | Scale applied after raw decode. |
| `offset` | Offset applied after scaling. |
| `unit` | Display unit. |
| `count` | Number of repeated values. |
| `strideBits` | Distance between repeated values. |
| `display.expression` | Optional expression for custom display text. |

## Dictionaries

Use dictionaries for textual values instead of hardcoding protocol meaning in code.

```json
"dictionaries": {
  "command_class": {
    "5": "response",
    "6": "command/request"
  },
  "message_good": {
    "0": "bad",
    "1": "good"
  }
}
```

A field references a dictionary by id:

```json
{
  "name": "command_class",
  "startBit": 26,
  "bitLength": 4,
  "type": "uint",
  "dictionary": "command_class"
}
```

## Example: Service-Style CAN-FD Profile

This example shows a message with a 29-bit CAN ID layout and a 16-bit payload header.

```json
{
  "schemaVersion": "1.0",
  "meta": {
    "id": "light_control",
    "name": "Light Control",
    "version": "1.0.0",
    "source": "k2_light_control.xml"
  },
  "bus": {
    "type": "can-fd",
    "idFormat": "extended",
    "byteOrder": "little"
  },
  "layouts": {
    "canId": {
      "label": "CAN ID",
      "bitLength": 29,
      "fields": [
        { "name": "command_class", "label": "Command", "startBit": 26, "bitLength": 4, "type": "uint", "dictionary": "command_class" },
        { "name": "destination_address", "label": "Destination", "startBit": 19, "bitLength": 6, "type": "uint" },
        { "name": "source_address", "label": "Source", "startBit": 13, "bitLength": 6, "type": "uint" },
        { "name": "service_identifier", "label": "Service", "startBit": 0, "bitLength": 10, "type": "uint" }
      ]
    },
    "payloadHeader": {
      "label": "Payload Header",
      "bitLength": 16,
      "fields": [
        { "name": "message_good", "label": "Status", "startBit": 0, "bitLength": 1, "type": "bool", "dictionary": "message_good" },
        { "name": "attribute_address", "label": "Attribute", "startBit": 1, "bitLength": 7, "type": "uint" },
        { "name": "feature_index", "label": "Feature", "startBit": 8, "bitLength": 4, "type": "uint" },
        { "name": "instance_index", "label": "Instance", "startBit": 12, "bitLength": 4, "type": "uint" }
      ]
    }
  },
  "dictionaries": {
    "command_class": {
      "3": "event/notification",
      "5": "response",
      "6": "command/request"
    },
    "message_good": {
      "0": "bad",
      "1": "good"
    }
  },
  "messages": [
    {
      "id": "on_off_cycles.get.response",
      "label": "On Off Cycles Get Response",
      "identifyBy": {
        "service_identifier": 810,
        "command_class": 5,
        "attribute_address": 3,
        "feature_index": 1
      },
      "payload": {
        "bitLength": 48,
        "fields": [
          { "name": "on_off_cycles", "label": "On Off Cycles", "startBit": 16, "bitLength": 32, "type": "uint" }
        ]
      }
    }
  ],
  "errors": [
    {
      "id": "default_error_status",
      "when": "message_good == 0",
      "source": {
        "startBit": 16,
        "bitLength": 32,
        "type": "uint",
        "byteOrder": "little"
      },
      "dictionary": "axis_error",
      "display": "Error ${raw}: ${text}"
    }
  ]
}
```

## Example: Motor Generic Profile

This is the canonical form of `profiles/test/motor-generic.profile.json`.

```json
{
  "schemaVersion": "1.0",
  "meta": {
    "id": "motor_generic",
    "name": "Motor Controller Generic",
    "version": "1.0.0"
  },
  "bus": {
    "type": "can",
    "idFormat": "standard",
    "byteOrder": "little"
  },
  "layouts": {
    "canId": {
      "label": "Standard 11-bit ID",
      "bitLength": 11,
      "fields": [
        { "name": "node_id", "label": "Node", "startBit": 0, "bitLength": 7, "type": "uint" },
        { "name": "message_class", "label": "Class", "startBit": 7, "bitLength": 4, "type": "uint" },
        { "name": "can_id", "label": "CAN ID", "startBit": 0, "bitLength": 11, "type": "uint" }
      ]
    }
  },
  "messages": [
    {
      "id": "motor_status",
      "label": "Motor Status",
      "identifyBy": {
        "can_id": 801
      },
      "payload": {
        "bitLength": 32,
        "fields": [
          { "name": "rpm", "label": "RPM", "startBit": 0, "bitLength": 16, "type": "uint", "factor": 0.25, "unit": "rpm" },
          { "name": "temperature", "label": "Temperature", "startBit": 16, "bitLength": 8, "type": "uint", "offset": -40, "unit": "degC" },
          { "name": "enabled", "label": "Enabled", "startBit": 24, "bitLength": 1, "type": "bool" }
        ]
      }
    }
  ]
}
```

## Example: J1939 Engine Profile

This is the canonical form of `profiles/test/j1939-engine.profile.json`.

```json
{
  "schemaVersion": "1.0",
  "meta": {
    "id": "j1939_engine",
    "name": "J1939 Engine Snapshot",
    "version": "1.0.0"
  },
  "bus": {
    "type": "can",
    "idFormat": "extended",
    "byteOrder": "little"
  },
  "layouts": {
    "canId": {
      "label": "J1939 29-bit ID",
      "bitLength": 29,
      "fields": [
        { "name": "source_address", "label": "Source Address", "startBit": 0, "bitLength": 8, "type": "uint" },
        { "name": "pgn", "label": "PGN", "startBit": 8, "bitLength": 18, "type": "uint" },
        { "name": "priority", "label": "Priority", "startBit": 26, "bitLength": 3, "type": "uint" }
      ]
    }
  },
  "messages": [
    {
      "id": "j1939.engine_speed",
      "label": "Engine Speed",
      "identifyBy": {
        "pgn": 61444
      },
      "payload": {
        "bitLength": 64,
        "fields": [
          { "name": "actual_torque", "label": "Actual Torque", "startBit": 16, "bitLength": 8, "type": "uint", "offset": -125, "unit": "%" },
          { "name": "engine_speed", "label": "Engine Speed", "startBit": 24, "bitLength": 16, "type": "uint", "factor": 0.125, "unit": "rpm" }
        ]
      }
    }
  ]
}
```

## Visual Editor Rules

The visual editor can be generic if it follows only this schema:

| JSON presence | Visual behavior |
| --- | --- |
| `layouts.canId` | Show CAN ID layout editor. |
| `layouts.payloadHeader` | Show payload header layout editor. |
| `dictionaries` | Show dictionary manager. |
| `messages` | Show message list and message editor. |
| `messages[].identifyBy` | Show message identification values. |
| `messages[].payload.fields` | Show payload field layout editor. |
| `errors` | Show error rules editor. |
| `display` | Show monitor/editor display preferences. |

The visual editor should not branch on protocol names or alternate profile shapes. It should render this canonical schema only.
