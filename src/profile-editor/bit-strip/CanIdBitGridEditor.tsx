import { CanIdField } from "../model/profile";
import { RangeGridEditor } from "./RangeGridEditor";

export function CanIdBitGridEditor(props: {
  bitLength: number;
  fields: CanIdField[];
  editable?: boolean;
  onChange: (name: string, start: number, length: number) => void;
}) {
  return (
    <RangeGridEditor
      length={props.bitLength}
      editable={props.editable}
      items={props.fields.map((f) => ({
        id: f.name,
        start: f.startBit,
        length: f.length,
        label: f.name,
      }))}
      unitLabel={(i) => i.toString()}
      onChange={props.onChange}
    />
  );
}
