import { DiffEditor } from "@monaco-editor/react";
import { useTheme } from "@/components/ThemeProvider";
import { useHelpContentStore } from "@/components/help-system/store/helpContentStore";
import { defineGithubLightTheme, defineTokyoNightTheme } from "./monacoThemes";

export function HelpDiff() {
  const { resolvedTheme } = useTheme();
  const defaultMarkdown = useHelpContentStore((s) => s.defaultMarkdown);
  const customMarkdown = useHelpContentStore((s) => s.customMarkdown);

  if (!customMarkdown || customMarkdown === defaultMarkdown) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No custom changes to compare
      </div>
    );
  }

  return (
    <DiffEditor
      height="100%"
      language="markdown"
      original={defaultMarkdown}
      modified={customMarkdown}
      theme={resolvedTheme === "dark" ? "tokyo-night" : "github-light"}
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
