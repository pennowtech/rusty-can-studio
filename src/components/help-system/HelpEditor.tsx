import Editor from "@monaco-editor/react";
import { useHelpContentStore } from "@/components/help-system/store/helpContentStore";
import { useTheme } from "@/components/ThemeProvider";
import { defineGithubLightTheme, defineTokyoNightTheme } from "./monacoThemes";

export function HelpEditor() {
  const value = useHelpContentStore((s) => s.selectedChapterMarkdown);
  const setSelectedChapterMarkdown = useHelpContentStore((s) => s.setSelectedChapterMarkdown);
  const { resolvedTheme } = useTheme();

  return (
    <Editor
      height="100%"
      language="markdown"
      value={value}
      onChange={(value) => setSelectedChapterMarkdown(value ?? "")}
      theme={resolvedTheme === "dark" ? "tokyo-night" : "github-light"}
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
        automaticLayout: true,
      }}
    />
  );
}
