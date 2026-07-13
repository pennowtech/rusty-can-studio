import { DiffEditor } from "@monaco-editor/react";
import { useTheme } from "@/components/ThemeProvider";
import { useHelpContentStore } from "@/components/help-system/store/helpContentStore";
import { defineGithubLightTheme, defineTokyoNightTheme } from "./monacoThemes";
import { splitHelpMarkdown } from "./utils/helpChapters";

export function HelpDiff() {
  const { resolvedTheme } = useTheme();
  const defaultMarkdown = useHelpContentStore((s) => s.defaultMarkdown);
  const selectedChapterId = useHelpContentStore((s) => s.selectedChapterId);
  const selectedChapterMarkdown = useHelpContentStore((s) => s.selectedChapterMarkdown);
  const defaultChapterMarkdown = splitHelpMarkdown(defaultMarkdown).find((chapter) => chapter.id === selectedChapterId)?.markdown ?? "";

  if (selectedChapterMarkdown === defaultChapterMarkdown) {
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
      original={defaultChapterMarkdown}
      modified={selectedChapterMarkdown}
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
