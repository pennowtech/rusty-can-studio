import { defineGithubLightTheme, defineTokyoNightTheme } from "@/components/help-system/monacoThemes";
import { useTheme } from "@/components/ThemeProvider";
import { JsonSaveEditor } from "@sbt/desktop-kit/components/JsonSaveEditor";

// Thin wrapper over the kit's shared JSON-with-Save/Undo/Redo editor,
// supplying this app's own Monaco themes — same split as
// bit-strip/CanIdBitGridEditor.tsx over RangeGridEditor. ProfileJsonView
// (the whole-profile editor) and every per-item drawer (message/dictionary/
// error/CAN-ID/payload-header) share this.
export function ScopedJsonEditor({
  value,
  onChange,
  readOnly,
  error,
}: {
  value: string;
  onChange: (text: string) => void;
  readOnly: boolean;
  error?: string;
}) {
  const { resolvedTheme } = useTheme();

  return (
    <JsonSaveEditor
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      error={error ? `JSON Error: ${error}` : undefined}
      monacoTheme={resolvedTheme === "dark" ? "tokyo-night" : "github-light"}
      beforeMount={(monaco) => {
        defineTokyoNightTheme(monaco);
        defineGithubLightTheme(monaco);
      }}
    />
  );
}
