export type CanonicalBusType = "can" | "can-fd";
export type CanonicalIdFormat = "standard" | "extended" | "custom";
export type CanonicalByteOrder = "little" | "big";
export type CanonicalFieldType = "uint" | "int" | "bool" | "enum" | "bytes" | "string";

export type CanonicalProfileMeta = {
  id: string;
  name: string;
  version: string;
  description?: string;
  source?: string;
};

export type CanonicalProfileBus = {
  type: CanonicalBusType;
  idFormat: CanonicalIdFormat;
  byteOrder: CanonicalByteOrder;
};

export type CanonicalField = {
  name: string;
  label?: string;
  note?: string;
  startBit: number;
  bitLength: number;
  type?: CanonicalFieldType;
  dictionary?: string;
  factor?: number;
  offset?: number;
  unit?: string;
  count?: number;
  strideBits?: number;
  display?: {
    expression?: string;
  };
};

export type CanonicalLayout = {
  label?: string;
  note?: string;
  bitLength: number;
  fields: CanonicalField[];
};

export type CanonicalMessage = {
  id: string;
  label: string;
  description?: string;
  identifyBy: Record<string, number | string | boolean | null>;
  identifyWhen?: string;
  payload: {
    bitLength: number;
    fields: CanonicalField[];
    display?: {
      expression?: string;
    };
  };
};

export type CanonicalErrorRule = {
  id: string;
  when: string;
  source: {
    startBit: number;
    bitLength: number;
    type: "uint" | "int";
    byteOrder?: CanonicalByteOrder;
  };
  dictionary?: string;
  display?: string;
};

export type CanonicalProfile = {
  schemaVersion: "1.0";
  meta: CanonicalProfileMeta;
  bus: CanonicalProfileBus;
  layouts: {
    canId: CanonicalLayout;
    payloadHeader?: CanonicalLayout;
  };
  dictionaries?: Record<string, Record<string, string>>;
  messages: CanonicalMessage[];
  errors?: CanonicalErrorRule[];
  display?: Record<string, unknown>;
};
