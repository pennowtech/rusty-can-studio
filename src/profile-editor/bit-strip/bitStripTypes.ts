export type BitHighlightColor = "blue" | "green" | "red" | "yellow";

export type BitHighlight = {
  id: string;
  start: number; // bit index
  length: number; // bit length
  color?: BitHighlightColor;
  label?: string;
  hasError?: boolean;
};
