export type ProfileViewMode = "visual" | "json" | "edit";

export type SignalDef = {
  name: string;
  startByte: number;
  length: number;
  byteOrder: "little" | "big";
  factor?: number;
  offset?: number;
  unit?: string;
};

export type FrameDef = {
  canIdLayout: string; // "0x18FF50E5"
  signals: SignalDef[];
};

export type FieldTypeDef = {
  kind: "enum" | "boolean" | "number" | "string";
  values?: Record<string, string>;
};

export type DerivedFieldDef = {
  name: string;
  source: "signal" | "expression";
  signal?: string;
  expression?: string;

  fieldType: string;
};

export type ColumnDef = {
  label: string;
  source: "frame" | "canId" | "signal" | "derived" | "expression";
  key?: string; // frame
  field?: string; // canId / derived
  signal?: string; // signal

  unit?: string;
  visible: boolean;
};

export type ProfileMeta = {
  name: string;
  version: string;
  description?: string;
};

export type CanIdField = {
  name: string;
  startBit: number;
  length: number;
  fieldTypeId?: string;
};

export type CanIdLayoutDef = {
  id: string;
  name: string;

  format: "standard" | "extended" | "custom";
  bitLength: number;

  fields: CanIdField[];
};

export type CanProfile = {
  meta: ProfileMeta;

  canIdLayouts: Record<string, CanIdLayoutDef>;
  frames: Record<string, FrameDef>;
  fieldTypes: Record<string, FieldTypeDef>;

  derivedFields: DerivedFieldDef[];
  columns: ColumnDef[];
};
