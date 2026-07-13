#!/usr/bin/env python3
"""
Convert k2_*.xml files into the canonical CAN/CAN-FD profile JSON shape.

The script is deliberately source-format agnostic at the output boundary: it
extracts XML metadata, then writes schemaVersion 1.0 profiles with layouts,
dictionaries, messages, error rules, and display hints.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def attr_value(node: ET.Element, *names: str) -> str | None:
    attrs = {key.lower(): value for key, value in node.attrib.items()}
    for name in names:
        value = attrs.get(name.lower())
        if value is not None:
            return value
    return None


def parse_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value.strip(), 0)
    except ValueError:
        match = re.search(r"0x[0-9a-fA-F]+|\d+", value)
        return int(match.group(0), 0) if match else None


def slugify(value: str | None, fallback: str) -> str:
    text = re.sub(r"[^A-Za-z0-9_.-]+", "_", value or "").strip("_")
    return text or fallback


def named(node: ET.Element, fallback: str) -> str:
    return (
        attr_value(
            node,
            "name",
            "identifier",
            "short_name",
            "shortName",
            "service_name",
            "instance_name",
            "attribute_name",
            "feature_name",
            "value_name",
            "enum_name",
            "error_name",
            "id",
        )
        or fallback
    )


def child_with_name(node: ET.Element, *parts: str) -> ET.Element | None:
    names = tuple(part.lower() for part in parts)
    for child in list(node):
        if any(part in local_name(child.tag) for part in names):
            return child
    return None


def children_with_name(node: ET.Element, *parts: str) -> list[ET.Element]:
    names = tuple(part.lower() for part in parts)
    return [child for child in list(node) if any(part in local_name(child.tag) for part in names)]


def type_bits(type_name: str, maximum_size: int | None = None) -> int:
    lower = type_name.lower()
    if lower in {"null", "void"}:
        return 0
    if lower in {"bool", "boolean"}:
        return 1
    match = re.search(r"(?:u?int)(\d+)_t|(?:u?int)(\d+)", lower)
    if match:
        return int(next(group for group in match.groups() if group))
    if "double" in lower:
        return 64
    if "float" in lower:
        return 32
    return 8 * (maximum_size or 1)


def value_type(type_name: str) -> str:
    lower = type_name.lower()
    if "enum" in lower:
        return "enum"
    if lower in {"bool", "boolean"}:
        return "bool"
    if lower.startswith("int") and not lower.startswith("uint"):
        return "int"
    return "uint"


def enum_dictionaries(root: ET.Element) -> dict[str, dict[str, str]]:
    dictionaries: dict[str, dict[str, str]] = {}
    for enum in root.iter():
        if local_name(enum.tag) != "enum":
            continue
        enum_name = attr_value(enum, "enum_name", "name")
        if not enum_name:
            continue
        values: dict[str, str] = {}
        for constant in enum.iter():
            if local_name(constant.tag) != "enum_constants":
                continue
            code = parse_int(attr_value(constant, "value", "id"))
            label = attr_value(constant, "enum_constant_name", "name")
            if code is not None and label:
                values[str(code)] = label
        if values:
            dictionaries[enum_name] = values
    return dictionaries


def payload_values(payload: ET.Element | None, dictionaries: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    if payload is None:
        return []
    fields: list[dict[str, Any]] = []
    bit_offset = 16
    for index, node in enumerate(list(payload), start=1):
        tag = local_name(node.tag)
        if tag not in {"value", "value_enum", "value_array"}:
            continue
        xml_type = attr_value(node, "value_type") or "uint8_t"
        maximum_size = parse_int(attr_value(node, "maximum_size", "size"))
        bits = type_bits(xml_type, maximum_size)
        if bits <= 0:
            continue
        enum_name = attr_value(node, "enum_name_from_dictionary", "enum_name")
        field_name = attr_value(node, "value_name") or enum_name or f"field_{index}"
        if field_name == "null":
            continue
        field: dict[str, Any] = {
            "name": field_name,
            "startBit": bit_offset,
            "bitLength": bits,
            "type": "enum" if enum_name else value_type(xml_type),
        }
        if enum_name and enum_name in dictionaries:
            field["dictionary"] = enum_name
        unit = attr_value(node, "value_unit", "unit")
        if unit:
            field["unit"] = unit
        if tag == "value_array":
            count = maximum_size or 1
            field["count"] = count
            field["strideBits"] = bits
            bit_offset += bits * count
        else:
            bit_offset += bits
        fields.append(field)
    return fields


def extract_errors(root: ET.Element) -> dict[str, str]:
    errors: dict[str, str] = {}
    for node in root.iter():
        if "error" not in local_name(node.tag):
            continue
        code = parse_int(attr_value(node, "code", "value", "id"))
        if code is not None:
            errors[str(code)] = named(node, f"error_{code}")
    return errors


def extract_instances(root: ET.Element) -> dict[str, str]:
    values: dict[str, str] = {}
    for node in root.iter():
        if local_name(node.tag) != "instance":
            continue
        index = parse_int(attr_value(node, "instance_index", "index", "id"))
        if index is not None:
            values[str(index)] = attr_value(node, "instance_name", "name") or f"instance_{index}"
    return values


def can_id_layout() -> dict[str, Any]:
    return {
        "label": "Universal CAN ID Layout",
        "bitLength": 29,
        "fields": [
            {"name": "command_class", "startBit": 26, "bitLength": 4, "type": "enum", "dictionary": "command_class"},
            {"name": "broadcast", "startBit": 25, "bitLength": 1, "type": "enum", "dictionary": "broadcast"},
            {"name": "destination_address", "startBit": 19, "bitLength": 6, "type": "uint"},
            {"name": "source_address", "startBit": 13, "bitLength": 6, "type": "uint"},
            {"name": "start_of_transfer", "startBit": 12, "bitLength": 1, "type": "enum", "dictionary": "start_of_transfer"},
            {"name": "end_of_transfer", "startBit": 11, "bitLength": 1, "type": "enum", "dictionary": "end_of_transfer"},
            {"name": "toggle", "startBit": 10, "bitLength": 1, "type": "uint"},
            {"name": "service_identifier", "startBit": 0, "bitLength": 10, "type": "enum", "dictionary": "service_identifier"},
        ],
    }


def payload_header_layout(instance_values: dict[str, str]) -> dict[str, Any]:
    fields: list[dict[str, Any]] = [
        {"name": "attribute_address", "startBit": 1, "bitLength": 7, "type": "enum", "dictionary": "attribute_address"},
        {"name": "message_good", "startBit": 0, "bitLength": 1, "type": "enum", "dictionary": "message_good"},
        {"name": "instance_index", "startBit": 12, "bitLength": 4, "type": "enum", "dictionary": "instance_index"},
        {"name": "feature_index", "startBit": 8, "bitLength": 4, "type": "enum", "dictionary": "feature_index"},
    ]
    if not instance_values:
        fields = [field for field in fields if field["name"] != "instance_index"]
    return {"label": "Payload header", "bitLength": 16, "fields": fields}


def message_definitions(root: ET.Element, source: Path, dictionaries: dict[str, dict[str, str]]) -> tuple[str, int, list[dict[str, Any]]]:
    service_identifier = parse_int(attr_value(root, "service_identifier", "serviceIdentifier", "service_id", "serviceId", "id")) or 0
    service_name = attr_value(root, "service_name", "name") or source.stem
    messages: list[dict[str, Any]] = []

    for attribute in root.iter():
      tag = local_name(attribute.tag)
      if tag not in {"property", "method", "event"}:
          continue
      attribute_address = parse_int(attr_value(attribute, "attribute_address", "address", "id"))
      if attribute_address is None:
          continue
      attribute_name = attr_value(attribute, "attribute_name", "name") or tag
      dictionaries.setdefault("attribute_address", {})[str(attribute_address)] = attribute_name

      for feature in children_with_name(attribute, "feature", "execute", "get", "set", "value"):
          feature_index = parse_int(attr_value(feature, "feature_index", "featureIndex", "index"))
          if feature_index is None:
              continue
          feature_name = attr_value(feature, "feature_name", "name") or local_name(feature.tag)
          dictionaries.setdefault("feature_index", {})[str(feature_index)] = feature_name
          for direction, command_class in (("command", 6), ("response", 5), ("event", 3)):
              if direction == "event" and tag != "event":
                  continue
              direction_node = child_with_name(feature, direction)
              payload_node = child_with_name(direction_node, "payload") if direction_node is not None else None
              fields = payload_values(payload_node, dictionaries)
              message_id = slugify(f"{service_name}.{attribute_name}.{feature_name}.{direction}", "message")
              messages.append(
                  {
                      "id": message_id,
                      "label": f"{attribute_name}.{feature_name}.{direction}",
                      "description": f"{service_name}.{attribute_name}.{feature_name}.{direction}",
                      "identifyBy": {
                          "service_identifier": service_identifier,
                          "command_class": command_class,
                          "attribute_address": attribute_address,
                          "feature_index": feature_index,
                      },
                      "payload": {
                          "bitLength": max((field["startBit"] + field["bitLength"] * int(field.get("count", 1)) for field in fields), default=16),
                          "fields": fields,
                      },
                  }
              )
    return service_name, service_identifier, messages


def canonical_profile(path: Path) -> dict[str, Any]:
    root = ET.parse(path).getroot()
    dictionaries = enum_dictionaries(root)
    instance_values = extract_instances(root)
    service_name, service_identifier, messages = message_definitions(root, path, dictionaries)
    dictionaries.update(
        {
            "command_class": {"6": "command/request", "5": "response", "3": "event/notification"},
            "broadcast": {"0": "unicast", "1": "broadcast"},
            "start_of_transfer": {"0": "not start", "1": "start"},
            "end_of_transfer": {"0": "not end", "1": "end"},
            "message_good": {"0": "bad", "1": "good"},
            "service_identifier": {str(service_identifier): service_name},
            **({"instance_index": instance_values} if instance_values else {}),
        }
    )
    error_values = extract_errors(root)
    if error_values:
        dictionaries["error_status"] = error_values
    errors = (
        [
            {
                "id": "default_error_status",
                "when": "message_good != 1",
                "source": {"startBit": 16, "bitLength": 32, "type": "uint", "byteOrder": "little"},
                "dictionary": "error_status",
                "display": "Error ${raw}: ${text}",
            }
        ]
        if error_values
        else []
    )
    return {
        "schemaVersion": "1.0",
        "meta": {
            "id": slugify(path.stem, "profile"),
            "name": f"{path.stem} CAN-FD Schema Profile v2" if path.stem == "k2_light_control" else f"{path.stem} CAN-FD Schema Profile",
            "version": "1.0.0",
            "source": path.name,
        },
        "bus": {"type": "can-fd", "idFormat": "extended", "byteOrder": "little"},
        "layouts": {"canId": can_id_layout(), "payloadHeader": payload_header_layout(instance_values)},
        "dictionaries": {key: value for key, value in dictionaries.items() if value},
        "messages": messages,
        "errors": errors,
        "display": {},
    }


def can_id_profile() -> dict[str, Any]:
    return {
        "schemaVersion": "1.0",
        "meta": {
            "id": "universal_can_id_layout",
            "name": "Universal CAN ID Layout",
            "version": "1.0.0",
            "description": "Reusable 29-bit arbitration ID layout profile.",
        },
        "bus": {"type": "can-fd", "idFormat": "extended", "byteOrder": "little"},
        "layouts": {"canId": can_id_layout()},
        "dictionaries": {
            "command_class": {"6": "command/request", "5": "response", "3": "event/notification"},
            "broadcast": {"0": "unicast", "1": "broadcast"},
            "start_of_transfer": {"0": "not start", "1": "start"},
            "end_of_transfer": {"0": "not end", "1": "end"},
        },
        "messages": [],
        "errors": [],
        "display": {},
    }


def write_split_profiles(paths: list[Path], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    layout_path = output_dir / "knossos_can_id_layout.json"
    layout_path.write_text(json.dumps(can_id_profile(), indent=2), encoding="utf-8")
    print(f"Wrote {layout_path}")
    for path in paths:
        profile = canonical_profile(path)
        output_path = output_dir / f"{path.stem}_profile.json"
        output_path.write_text(json.dumps(profile, indent=2), encoding="utf-8")
        print(f"Wrote {output_path} ({len(profile['messages'])} messages)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert XML files to canonical CAN-FD profile JSON.")
    parser.add_argument("xml", nargs="+", type=Path, help="Input XML files")
    parser.add_argument("-o", "--output", type=Path, help="Output combined JSON profile path")
    parser.add_argument("--split-dir", type=Path, help="Write one profile per XML plus a reusable CAN ID layout JSON")
    args = parser.parse_args()

    missing = [path for path in args.xml if not path.exists()]
    if missing:
        print(f"Missing XML files: {', '.join(str(path) for path in missing)}", file=sys.stderr)
        return 2
    if args.split_dir:
        write_split_profiles(args.xml, args.split_dir)
        return 0
    if not args.output:
        print("Either --output or --split-dir is required.", file=sys.stderr)
        return 2
    profile = canonical_profile(args.xml[0])
    args.output.write_text(json.dumps(profile, indent=2), encoding="utf-8")
    print(f"Wrote {args.output}")
    print(f"Messages: {len(profile['messages'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
