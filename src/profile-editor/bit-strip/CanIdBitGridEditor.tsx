import { RangeGridEditor } from "./RangeGridEditor";

type CanIdGridField = {
  name: string;
  startBit: number;
  bitLength: number;
};

export function CanIdBitGridEditor(props: {
  bitLength: number;
  fields: CanIdGridField[];
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
        length: f.bitLength,
        label: f.name,
      }))}
      unitLabel={(i) => i.toString()}
      onChange={props.onChange}
    />
  );
}
