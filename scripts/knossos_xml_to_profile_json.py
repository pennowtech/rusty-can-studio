#!/usr/bin/env python3
"""
Convert Knossos k2_*.xml schema files into the CAN-FD workbench JSON profile shape.

The converter is intentionally conservative: it extracts service, instance,
attribute, feature, field, and error metadata when the XML exposes recognizable
names or attributes. Review the generated JSON before using it for live decode.
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
    attributes = {key.lower(): value for key, value in node.attrib.items()}
    for name in names:
        value = attributes.get(name.lower())
        if value is not None:
            return value
    return None


def parse_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    text = value.strip()
    try:
        return int(text, 0)
    except ValueError:
        match = re.search(r"0x[0-9a-fA-F]+|\d+", text)
        return int(match.group(0), 0) if match else None


def node_name(node: ET.Element, fallback: str) -> str:
    return attr_value(
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
    ) or fallback


def find_children(node: ET.Element, *name_parts: str) -> list[ET.Element]:
    parts = tuple(part.lower() for part in name_parts)
    return [child for child in list(node) if any(part in local_name(child.tag) for part in parts)]


def first_child(node: ET.Element, *name_parts: str) -> ET.Element | None:
    children = find_children(node, *name_parts)
    return children[0] if children else None


def type_bit_length(type_name: str, maximum_size: int | None = None) -> int:
    lower = type_name.lower()
    if lower in {"null", "void"}:
        return 0
    if lower in {"bool", "boolean"}:
        return 1
    if lower in {"char"}:
        return 8 * (maximum_size or 1)
    match = re.search(r"(?:u?int)(\d+)_t|(?:u?int)(\d+)", lower)
    if match:
        return int(next(group for group in match.groups() if group))
    if "float" in lower:
        return 32
    if "double" in lower:
        return 64
    return 8 * (maximum_size or 1)


def field_type(type_name: str) -> str:
    lower = type_name.lower()
    if "enum" in lower:
        return "enum"
    if lower in {"bool", "boolean"}:
        return "bool"
    if lower.startswith("int") and not lower.startswith("uint"):
        return "int"
    return "uint"


def extract_enums(root: ET.Element) -> dict[str, dict[str, str]]:
    enums: dict[str, dict[str, str]] = {}
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
            value = parse_int(attr_value(constant, "value", "id"))
            name = attr_value(constant, "enum_constant_name", "name")
            if value is not None and name:
                values[str(value)] = name
        enums[enum_name] = values
    return enums


def payload_fields_from_payload(payload: ET.Element | None, enums: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    if payload is None:
        return []

    fields: list[dict[str, Any]] = []
    bit_offset = 16
    for index, node in enumerate(list(payload), start=1):
        tag = local_name(node.tag)
        if tag not in {"value", "value_enum", "value_array"}:
            continue

        if tag == "value_enum":
            enum_name = attr_value(node, "enum_name_from_dictionary", "enum_name", "value_type") or "enum"
            name = attr_value(node, "value_name") or enum_name
            length = type_bit_length(attr_value(node, "value_type") or "uint8_t")
            values = enums.get(enum_name)
            kind = "enum"
        else:
            type_name = attr_value(node, "value_type") or "uint8_t"
            name = attr_value(node, "value_name") or f"field_{index}"
            maximum_size = parse_int(attr_value(node, "maximum_size", "size"))
            length = type_bit_length(type_name)
            values = None
            kind = field_type(type_name)

        if name == "null" or length == 0:
            continue

        if tag == "value_array":
            maximum_size = parse_int(attr_value(node, "maximum_size", "size")) or 1
            unit = attr_value(node, "value_unit", "unit")
            field: dict[str, Any] = {
                "name": name,
                "byte": bit_offset // 8,
                "startBit": bit_offset % 8,
                "length": length,
                "type": kind,
                "count": maximum_size,
                "stride": max(1, length // 8),
            }
            if unit:
                field["unit"] = unit
            if values:
                field["values"] = values
            fields.append(field)
            bit_offset += length * maximum_size
            continue

        field: dict[str, Any] = {
            "name": name,
            "byte": bit_offset // 8,
            "startBit": bit_offset % 8,
            "length": length,
            "type": kind,
        }
        unit = attr_value(node, "value_unit", "unit")
        if unit:
            field["unit"] = unit
        if values:
            field["values"] = values
        fields.append(field)
        bit_offset += length
    return fields


def payload_field_from_node(node: ET.Element, index: int) -> dict[str, Any]:
    name = node_name(node, f"field_{index}")
    start_bit = parse_int(attr_value(node, "startBit", "start_bit", "bitOffset", "bit_offset")) or 0
    length = parse_int(attr_value(node, "length", "bitLength", "bit_length", "size", "bits")) or 8
    byte = parse_int(attr_value(node, "byte", "byteOffset", "byte_offset"))
    type_name = attr_value(node, "type", "dataType", "datatype", "kind") or "uint"
    factor = attr_value(node, "factor", "scale")
    offset = attr_value(node, "offset")
    unit = attr_value(node, "unit")

    field: dict[str, Any] = {
        "name": name,
        "startBit": start_bit,
        "length": length,
        "type": "int" if "int" in type_name.lower() and "uint" not in type_name.lower() else "uint",
    }
    if byte is not None:
        field["byte"] = byte
    if factor is not None:
        field["factor"] = float(factor)
    if offset is not None:
        field["offset"] = float(offset)
    if unit:
        field["unit"] = unit
    return field


def feature_from_node(node: ET.Element, index: int) -> dict[str, Any]:
    feature_index = parse_int(attr_value(node, "feature_index", "featureIndex", "index", "id", "value"))
    fields = [
        payload_field_from_node(field, idx)
        for idx, field in enumerate(find_children(node, "field", "parameter", "payload", "argument"), start=1)
    ]
    return {
        "name": node_name(node, f"feature_{feature_index if feature_index is not None else index}"),
        "index": feature_index if feature_index is not None else index,
        "payloadOffsetBytes": parse_int(attr_value(node, "payloadOffsetBytes", "payload_offset_bytes")) or 2,
        "fields": fields,
    }


def attribute_from_node(node: ET.Element, index: int) -> dict[str, Any] | None:
    address = parse_int(attr_value(node, "attribute_address", "attributeAddress", "address", "id"))
    if address is None:
        return None

    tag = local_name(node.tag)
    if "event" in tag:
        kind = "event"
    elif "property" in tag:
        kind = "property"
    else:
        kind = "method"

    feature_nodes = find_children(node, "feature", "execute", "get", "set", "value")
    features = [feature_from_node(feature, idx) for idx, feature in enumerate(feature_nodes, start=1)]
    if not features:
        features = [{"name": "value", "index": 0, "payloadOffsetBytes": 2, "fields": []}]

    return {
        "name": node_name(node, f"attribute_{address}"),
        "attributeAddress": address,
        "kind": kind,
        "features": features,
    }


def instance_from_node(node: ET.Element, index: int) -> dict[str, Any]:
    instance_index = parse_int(attr_value(node, "instance_index", "instanceIndex", "index", "id")) or index
    attribute_nodes = find_children(node, "method", "event", "property", "attribute")
    attributes = [
        attribute
        for idx, candidate in enumerate(attribute_nodes, start=1)
        if (attribute := attribute_from_node(candidate, idx)) is not None
    ]
    return {
        "name": node_name(node, f"instance_{instance_index}"),
        "index": instance_index,
        "attributes": attributes,
    }


def service_from_node(node: ET.Element, source: Path) -> dict[str, Any] | None:
    service_identifier = parse_int(attr_value(node, "service_identifier", "serviceIdentifier", "service_id", "serviceId", "id"))
    if service_identifier is None:
        return None

    instance_nodes = find_children(node, "instance")
    instances = [instance_from_node(instance, idx) for idx, instance in enumerate(instance_nodes, start=1)]
    if not instances:
        instances = [instance_from_node(node, 0)]

    return {
        "name": node_name(node, source.stem),
        "serviceIdentifier": service_identifier,
        "instances": instances,
    }


def extract_services(root: ET.Element, source: Path) -> list[dict[str, Any]]:
    services: list[dict[str, Any]] = []
    for node in root.iter():
        service = service_from_node(node, source)
        if service is not None:
            services.append(service)
    return services


def extract_instances(root: ET.Element) -> list[dict[str, Any]]:
    instances: dict[int, dict[str, Any]] = {}
    for node in root.iter():
        if local_name(node.tag) != "instance":
            continue
        index = parse_int(attr_value(node, "instance_index", "index", "id"))
        if index is None:
            continue
        instances[index] = {
            "name": attr_value(node, "instance_name", "name") or f"instance_{index}",
            "index": index,
        }
    return [instances[index] for index in sorted(instances)] or [{"name": "instance_0", "index": 0}]


def is_attribute_node(node: ET.Element) -> bool:
    return local_name(node.tag) in {"property", "method", "event"}


def feature_nodes_for_attribute(attribute: ET.Element) -> list[ET.Element]:
    return [
        child
        for child in list(attribute)
        if parse_int(attr_value(child, "feature_index", "featureIndex", "index")) is not None
    ]


def fields_for_feature(feature: ET.Element, direction: str, enums: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    direction_node = first_child(feature, direction)
    return payload_fields_from_payload(first_child(direction_node, "payload") if direction_node is not None else None, enums)


def apply_payload_header_values(profile: dict[str, Any], instances: list[dict[str, Any]]) -> None:
    instance_values = {
        str(instance["index"]): instance["name"]
        for instance in instances
        if instance.get("index") is not None and instance.get("name")
    }
    if not instance_values:
        return

    for field in profile["messageSchema"]["payloadHeader"]["fields"]:
        if field.get("name") == "instance_index":
            field["values"] = instance_values
            return


def message_definition_for_feature(
    service: dict[str, Any],
    attribute: ET.Element,
    feature: ET.Element,
    direction: str,
    command_class: int,
    fields: list[dict[str, Any]],
) -> dict[str, Any]:
    attribute_name = attr_value(attribute, "attribute_name", "name") or local_name(attribute.tag)
    attribute_address = parse_int(attr_value(attribute, "attribute_address", "address", "id")) or 0
    feature_index = parse_int(attr_value(feature, "feature_index", "featureIndex", "index")) or 0
    feature_name = attr_value(feature, "feature_name", "name") or local_name(feature.tag)
    definition_id = f"{service['name']}.{attribute_name}.{feature_name}.{direction}"
    return {
        "id": definition_id,
        "label": f"{attribute_name}.{feature_name}.{direction}",
        "serviceName": service["name"],
        "attributeName": attribute_name,
        "featureName": f"{feature_name}.{direction}",
        "meaning": definition_id,
        "match": {
            "canId": {
                "service_identifier": service["serviceIdentifier"],
                "command_class": command_class,
            },
            "payloadHeader": {
                "attribute_address": attribute_address,
                "feature_index": feature_index,
            },
        },
        "payloadFields": fields,
    }


def schema_message_definitions_from_xml(root: ET.Element, source: Path) -> list[dict[str, Any]]:
    service_identifier = parse_int(attr_value(root, "service_identifier", "serviceIdentifier", "service_id", "serviceId", "id"))
    if service_identifier is None:
        return []

    service = {
        "name": attr_value(root, "service_name", "name") or source.stem,
        "serviceIdentifier": service_identifier,
    }
    enums = extract_enums(root)
    message_definitions: list[dict[str, Any]] = []

    for attribute in root.iter():
        if not is_attribute_node(attribute):
            continue

        for feature in feature_nodes_for_attribute(attribute):
            command_fields = fields_for_feature(feature, "command", enums)
            response_fields = fields_for_feature(feature, "response", enums)
            event_fields = fields_for_feature(feature, "event", enums) or response_fields or command_fields

            message_definitions.append(message_definition_for_feature(service, attribute, feature, "command", 6, command_fields))
            message_definitions.append(message_definition_for_feature(service, attribute, feature, "response", 5, response_fields))
            if local_name(attribute.tag) == "event":
                message_definitions.append(message_definition_for_feature(service, attribute, feature, "event", 3, event_fields))

    return message_definitions


def extract_errors(root: ET.Element) -> dict[str, str]:
    errors: dict[str, str] = {}
    for node in root.iter():
        tag = local_name(node.tag)
        if "error" not in tag:
            continue
        code = parse_int(attr_value(node, "code", "value", "id"))
        if code is None:
            continue
        errors[str(code)] = node_name(node, f"error_{code}")
    return errors


CAN_ID_LAYOUT_ID = "knossos_can_id"


def base_profile(source_files: list[Path], embed_can_id_layout: bool = True) -> dict[str, Any]:
    can_id_fields = [
        {"name": "command_class", "startBit": 26, "length": 4, "values": {"6": "command/request", "5": "response", "3": "event/notification"}},
        {"name": "broadcast", "startBit": 25, "length": 1, "values": {"0": "unicast", "1": "broadcast"}},
        {"name": "destination_address", "startBit": 19, "length": 6},
        {"name": "source_address", "startBit": 13, "length": 6},
        {"name": "start_of_transfer", "startBit": 12, "length": 1, "values": {"0": "not start", "1": "start"}},
        {"name": "end_of_transfer", "startBit": 11, "length": 1, "values": {"0": "not end", "1": "end"}},
        {"name": "toggle", "startBit": 10, "length": 1},
        {"name": "service_identifier", "startBit": 0, "length": 10},
    ]
    payload_header_fields = [
        {"name": "attribute_address", "byte": 0, "startBit": 1, "length": 7},
        {"name": "message_good", "byte": 0, "startBit": 0, "length": 1, "type": "bool", "values": {"0": "bad", "1": "good"}},
        {"name": "instance_index", "byte": 1, "startBit": 4, "length": 4},
        {"name": "feature_index", "byte": 1, "startBit": 0, "length": 4},
    ]
    return {
        "meta": {
            "name": "Generic CAN-FD Schema Profile",
            "version": "1.0.0",
            "source": ", ".join(path.name for path in source_files),
        },
        "byteOrder": "little",
        "protocol": "schema",
        "defaultCanIdLayoutId": CAN_ID_LAYOUT_ID,
        "canIdLayouts": {
            CAN_ID_LAYOUT_ID: {
                "id": CAN_ID_LAYOUT_ID,
                "name": "Universal CAN ID Layout",
                "format": "extended",
                "bitLength": 29,
                "fields": can_id_fields,
            }
        } if embed_can_id_layout else {},
        "messageSchema": {
            "canIdLayoutRef": CAN_ID_LAYOUT_ID,
            **({
            "canIdLayout": {
                "bitLength": 29,
                "fields": can_id_fields,
                "enums": {
                    "command_class": {
                        "6": "command/request",
                        "5": "response",
                        "3": "event/notification",
                    }
                },
            }} if embed_can_id_layout else {}),
            "payloadHeader": {
                "lengthBytes": 2,
                "fields": payload_header_fields,
            },
            "messageDefinitions": [],
            "errors": {},
            "error": {
                "field": "message_good",
                "goodValue": 1,
                "byteOffset": 2,
                "byteLength": 4,
                "byteOrder": "little",
                "values": {},
            },
        },
        "frames": {},
        "fieldTypes": {},
        "derivedFields": [],
        "columns": [],
    }


def message_definitions_from_services(services: list[dict[str, Any]]) -> list[dict[str, Any]]:
    message_definitions: list[dict[str, Any]] = []
    for service in services:
        for instance in service.get("instances", []):
            for attribute in instance.get("attributes", []):
                for feature in attribute.get("features", []):
                    definition_id = f"{service['name']}.{instance['name']}.{attribute['name']}.{feature['name']}"
                    message_definitions.append(
                        {
                            "id": definition_id,
                            "label": feature["name"],
                            "serviceName": service["name"],
                            "instanceName": instance["name"],
                            "attributeName": attribute["name"],
                            "featureName": feature["name"],
                            "meaning": definition_id,
                            "match": {
                                "canId": {"service_identifier": service["serviceIdentifier"]},
                                "payloadHeader": {
                                    "instance_index": instance["index"],
                                    "attribute_address": attribute["attributeAddress"],
                                    "feature_index": feature["index"],
                                },
                            },
                            "payloadFields": feature.get("fields", []),
                        }
                    )
    return message_definitions


def convert(paths: list[Path]) -> dict[str, Any]:
    profile = base_profile(paths)
    message_definitions: list[dict[str, Any]] = []
    errors: dict[str, str] = {}
    instances_by_index: dict[int, dict[str, Any]] = {}

    for path in paths:
        root = ET.parse(path).getroot()
        message_definitions.extend(schema_message_definitions_from_xml(root, path))
        errors.update(extract_errors(root))
        for instance in extract_instances(root):
            instances_by_index[instance["index"]] = instance

    profile["messageSchema"]["messageDefinitions"] = message_definitions
    profile["messageSchema"]["errors"] = errors
    profile["messageSchema"]["error"]["values"] = errors
    apply_payload_header_values(profile, [instances_by_index[index] for index in sorted(instances_by_index)])
    return profile


def profile_name_for(path: Path) -> str:
    if path.stem == "k2_light_control":
        return "k2_light_control CAN-FD Schema Profile v2"
    return f"{path.stem} CAN-FD Schema Profile"


def compact_profile_from_expanded(profile: dict[str, Any]) -> dict[str, Any]:
    schema = profile["messageSchema"]
    definitions = schema.get("messageDefinitions", [])
    first_definition = definitions[0] if definitions else {}
    service_identifier = first_definition.get("match", {}).get("canId", {}).get("service_identifier")
    service_name = first_definition.get("serviceName") or profile["meta"]["source"].removesuffix(".xml")
    attributes_by_key: dict[tuple[int, str], dict[str, Any]] = {}

    for definition in definitions:
        match = definition.get("match", {})
        header_match = match.get("payloadHeader", {})
        can_match = match.get("canId", {})
        attribute_address = header_match.get("attribute_address")
        feature_index = header_match.get("feature_index")
        command_class = can_match.get("command_class")
        if attribute_address is None or feature_index is None or command_class is None:
            continue

        variant = {6: "command", 5: "response", 3: "event"}.get(command_class)
        if variant is None:
            continue

        attribute_name = definition.get("attributeName") or f"attribute_{attribute_address}"
        feature_name = definition.get("featureName") or definition.get("label") or f"feature_{feature_index}.{variant}"
        suffix = f".{variant}"
        operation_type = feature_name[: -len(suffix)] if feature_name.endswith(suffix) else feature_name
        attribute_key = (attribute_address, attribute_name)
        attribute = attributes_by_key.setdefault(
            attribute_key,
            {
                "name": attribute_name,
                "address": attribute_address,
                "operations": [],
            },
        )
        operations = attribute["operations"]
        operation = next((item for item in operations if item.get("type") == operation_type and item.get("featureIndex") == feature_index), None)
        if operation is None:
            operation = {
                "type": operation_type,
                "featureIndex": feature_index,
                "variants": {},
            }
            operations.append(operation)
        operation["variants"][variant] = definition.get("payloadFields", [])

    compact: dict[str, Any] = {
        "meta": profile["meta"],
        "byteOrder": profile.get("byteOrder", "little"),
        "protocol": profile.get("protocol", "schema"),
        "canIdLayoutRef": profile.get("defaultCanIdLayoutId", CAN_ID_LAYOUT_ID),
        "service": {
            "name": service_name,
            "identifier": service_identifier,
        },
        "payloadHeader": schema.get("payloadHeader", {"lengthBytes": 2, "fields": []}),
        "attributes": list(attributes_by_key.values()),
    }

    error_config = schema.get("error") or {}
    error_codes = schema.get("errors") or error_config.get("values") or {}
    compact["errorStatus"] = {
        "field": error_config.get("field", "message_good"),
        "goodValue": error_config.get("goodValue", 1),
        "byteOffset": error_config.get("byteOffset", 2),
        "byteLength": error_config.get("byteLength", 4),
        "byteOrder": error_config.get("byteOrder", "little"),
    }
    if error_codes:
        compact["errorStatus"]["codes"] = error_codes

    return compact


def convert_one(path: Path) -> dict[str, Any]:
    profile = base_profile([path], embed_can_id_layout=True)
    root = ET.parse(path).getroot()
    errors = extract_errors(root)
    profile["messageSchema"]["messageDefinitions"] = schema_message_definitions_from_xml(root, path)
    profile["messageSchema"]["errors"] = errors
    profile["messageSchema"]["error"]["values"] = errors
    apply_payload_header_values(profile, extract_instances(root))
    profile["meta"]["name"] = profile_name_for(path)
    profile["meta"]["source"] = path.name
    return compact_profile_from_expanded(profile)


def can_id_fragment() -> dict[str, Any]:
    profile = base_profile([])
    return {
        "meta": {
            "name": "Knossos Universal CAN ID Layout",
            "version": "1.0.0",
            "description": "Reusable 29-bit Knossos arbitration ID layout fragment. Generated split profiles reference this layout by id.",
        },
        "defaultCanIdLayoutId": profile["defaultCanIdLayoutId"],
        "byteOrder": "little",
        "protocol": "generic",
        "canIdLayouts": profile["canIdLayouts"],
        "frames": {},
        "fieldTypes": {},
        "derivedFields": [],
        "columns": [],
    }


def write_split_profiles(paths: list[Path], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    can_id_path = output_dir / "knossos_can_id_layout.json"
    can_id_path.write_text(json.dumps(can_id_fragment(), indent=2), encoding="utf-8")
    print(f"Wrote {can_id_path}")

    for path in paths:
        profile = convert_one(path)
        output_path = output_dir / f"{path.stem}_profile.json"
        output_path.write_text(json.dumps(profile, indent=2), encoding="utf-8")
        print(
            f"Wrote {output_path} "
            f"({len(profile.get('attributes', []))} attributes, "
            f"{len(profile.get('errorStatus', {}).get('codes', {}))} errors)"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert Knossos XML files to CAN-FD workbench profile JSON.")
    parser.add_argument("xml", nargs="+", type=Path, help="Input k2_*.xml files")
    parser.add_argument("-o", "--output", type=Path, help="Output combined JSON profile path")
    parser.add_argument("--split-dir", type=Path, help="Write one self-contained profile per XML plus an optional reusable CAN ID layout JSON")
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

    profile = convert(args.xml)
    args.output.write_text(json.dumps(profile, indent=2), encoding="utf-8")
    print(f"Wrote {args.output}")
    print(f"Message definitions: {len(profile['messageSchema']['messageDefinitions'])}")
    print(f"Errors: {len(profile['messageSchema']['errors'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
