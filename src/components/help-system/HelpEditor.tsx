import Editor from "@monaco-editor/react";
import { useHelpContentStore } from "@/components/help-system/store/helpContentStore";
import { useTheme } from "@/components/ThemeProvider";
import { defineGithubLightTheme, defineTokyoNightTheme } from "./monacoThemes";

export function HelpEditor() {
  const value = useHelpContentStore((s) => s.customMarkdown ?? s.defaultMarkdown);
  const setCustomMarkdown = useHelpContentStore((s) => s.setCustomMarkdown);
  const { theme } = useTheme();

  return (
    <Editor
      height="80vh"
      language="markdown"
      value={value}
      onChange={(value) => setCustomMarkdown(value ?? "")}
      theme={theme === "dark" ? "tokyo-night" : "github-light"}
      beforeMount={(monaco) => {
        defineTokyoNightTheme(monaco);
        defineGithubLightTheme(monaco);
      }}
      options={{
        wordWrap: "on",
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        renderWhitespace: "selection",
        cursorSmoothCaretAnimation: "on",
        padding: { top: 8 },
      }}
    />
  );
}
