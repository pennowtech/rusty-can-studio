import { DiffEditor } from "@monaco-editor/react";
import { useTheme } from "@/components/ThemeProvider";
import { useHelpContentStore } from "@/components/help-system/store/helpContentStore";
import { defineTokyoNightTheme, defineGithubLightTheme } from "./monacoThemes";

export function HelpDiff() {
  const { theme } = useTheme();
  const defaultMarkdown = useHelpContentStore((s) => s.defaultMarkdown);
  const customMarkdown = useHelpContentStore((s) => s.customMarkdown);

  // No custom changes → nothing to diff
  if (!customMarkdown || customMarkdown === defaultMarkdown) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No custom changes to compare
      </div>
    );
  }

  return (
    <DiffEditor
      height="80vh"
      language="markdown"
      original={defaultMarkdown}
      modified={customMarkdown}
      theme={theme === "dark" ? "tokyo-night" : "github-light"}
      beforeMount={(monaco) => {
        defineTokyoNightTheme(monaco);
        defineGithubLightTheme(monaco);
      }}
      options={{
        readOnly: true,
        renderSideBySide: true,
        minimap: { enabled: false },
        renderOverviewRuler: false,
        hideUnchangedRegions: {
          enabled: true,
        },
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
    />
  );
}
