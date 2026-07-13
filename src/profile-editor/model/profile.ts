export type ProfileViewMode = "json" | "edit";

export type SignalDef = {
  name: string;
  startByte: number;
  length: number;
  startBit?: number;
  bitLength?: number;
  signed?: boolean;
  factor?: number;
  offset?: number;
  unit?: string;
  expression?: string;
};

export type FrameDef = {
  canId?: number;
  label?: string;
  note?: string;
  payloadLength?: number;
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

export type BitFieldDef = {
  name: string;
  startBit: number;
  length: number;
  byte?: number;
  type?: "uint" | "int" | "bool" | "enum";
  values?: Record<string, string>;
};

export type PayloadFieldDef = BitFieldDef & {
  factor?: number;
  offset?: number;
  unit?: string;
  expression?: string;
  count?: number;
  stride?: number;
};

export type CompactProfileServiceDef = {
  name: string;
  identifier: number;
};

export type CompactProfileOperationDef = {
  type: string;
  featureIndex: number;
  variants: Partial<Record<"command" | "response" | "event", PayloadFieldDef[]>>;
};

export type CompactProfileAttributeDef = {
  name: string;
  address: number;
  operations: CompactProfileOperationDef[];
};

export type CompactProfileErrorStatusDef = {
  field?: string;
  goodValue?: number | string | boolean;
  badValue?: number | string | boolean;
  byteOffset?: number;
  byteLength?: number;
  byteOrder?: "little" | "big";
  codes?: Record<string, string>;
};

export type PayloadFeatureDef = {
  name: string;
  index: number;
  payloadOffsetBytes?: number;
  fields: PayloadFieldDef[];
};

export type KnossosAttributeDef = {
  name: string;
  attributeAddress: number;
  kind?: "method" | "event" | "property";
  features: PayloadFeatureDef[];
};

export type KnossosInstanceDef = {
  name: string;
  index: number;
  attributes: KnossosAttributeDef[];
};

export type KnossosServiceDef = {
  name: string;
  serviceIdentifier: number;
  instances: KnossosInstanceDef[];
};

export type KnossosSchemaDef = {
  canIdLayout: {
    bitLength: number;
    fields: BitFieldDef[];
    enums?: Record<string, Record<string, string>>;
  };
  payloadHeader: {
    lengthBytes: number;
    fields: BitFieldDef[];
  };
  services: KnossosServiceDef[];
  errors?: Record<string, string>;
};

export type SchemaFieldLayoutDef = {
  label?: string;
  note?: string;
  bitLength?: number;
  lengthBytes?: number;
  fields: BitFieldDef[];
  enums?: Record<string, Record<string, string>>;
};

export type SchemaRouteMatchDef = {
  canId?: Record<string, number | string | boolean>;
  payloadHeader?: Record<string, number | string | boolean>;
};

export type SchemaRouteDef = {
  id?: string;
  name?: string;
  label?: string;
  note?: string;
  serviceName?: string;
  instanceName?: string;
  attributeName?: string;
  featureName?: string;
  meaning?: string;
  match: SchemaRouteMatchDef;
  payloadFields: PayloadFieldDef[];
};

export type SchemaErrorDef = {
  when?: Record<string, number | string | boolean>;
  field?: string;
  badValue?: number | string | boolean;
  goodValue?: number | string | boolean;
  byteOffset?: number;
  byteLength?: number;
  byteOrder?: "little" | "big";
  values?: Record<string, string>;
};

export type MessageSchemaDef = {
  name?: string;
  canIdLayoutRef?: string;
  canIdLayout?: SchemaFieldLayoutDef;
  payloadHeader?: SchemaFieldLayoutDef;
  messageDefinitions: SchemaRouteDef[];
  errors?: Record<string, string>;
  error?: SchemaErrorDef;
};

export type ProfileMeta = {
  name: string;
  version: string;
  description?: string;
  source?: string;
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
  label?: string;
  note?: string;

  format: "standard" | "extended" | "custom";
  bitLength: number;

  fields: CanIdField[];
};

export type CanProfile = {
  meta: ProfileMeta;
  byteOrder?: "little" | "big";
  defaultCanIdLayoutId?: string;
  protocol?: "generic" | "knossos" | "schema";
  canIdLayoutRef?: string;
  service?: CompactProfileServiceDef;
  payloadHeader?: SchemaFieldLayoutDef;
  attributes?: CompactProfileAttributeDef[];
  errorStatus?: CompactProfileErrorStatusDef;
  messageSchema?: MessageSchemaDef;
  knossos?: KnossosSchemaDef;

  canIdLayouts: Record<string, CanIdLayoutDef>;
  frames: Record<string, FrameDef>;
  fieldTypes: Record<string, FieldTypeDef>;

  derivedFields: DerivedFieldDef[];
  columns: ColumnDef[];
};

export type ProfileDocument = CanProfile;
