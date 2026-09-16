import { RangeGridEditor } from "@sbt/desktop-kit/components/RangeGridEditor";

// Despite the filename, this is used for any {name, startBit, bitLength}[]
// field set — CAN ID layout fields, payload common fields, and per-message
// payload fields all share this shape. It exists purely to adapt that
// CAN-schema field shape onto the kit's generic RangeItem — the kit
// component itself has no CAN concept. Read-only overview only — start/
// bitLength are set through the field's own form, not by dragging bits
// here (that's the point: quickly spotting overlaps, not editing).
type BitLayoutField = {
  name: string;
  startBit: number;
  bitLength: number;
};

export function CanIdBitGridEditor(props: {
  bitLength: number;
  fields: BitLayoutField[];
  // Reflects whichever field is selected elsewhere in the surrounding UI
  // (an open FieldCard, typically) — not mouse hover. Selecting a bit here
  // calls onSelectField, and the caller is expected to wire that to the
  // same selection state so the two stay in sync both ways.
  activeFieldName?: string | null;
  onSelectField?: (name: string | null) => void;
}) {
  return (
    <RangeGridEditor
      length={props.bitLength}
      activeItemId={props.activeFieldName}
      onSelectItem={props.onSelectField}
      items={props.fields.map((f) => ({
        id: f.name,
        start: f.startBit,
        length: f.bitLength,
        label: f.name,
      }))}
      unitLabel={(i) => i.toString()}
    />
  );
}
