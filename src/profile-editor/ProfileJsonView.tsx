import { defineGithubLightTheme, defineTokyoNightTheme } from "@/components/help-system/monacoThemes";
import { useTheme } from "@/components/ThemeProvider";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { Editor } from "@monaco-editor/react";

export function ProfileJsonView() {
  const { viewMode, updateDraftFromJson, draftProfile, profile, jsonError } = useProfileStore();
  const activeProfile = viewMode === "edit" ? draftProfile : profile;
  const { theme } = useTheme();

  return (
    <div className="h-full border rounded-lg overflow-hidden">
      <Editor
        height="78vh"
        language="json"
        value={JSON.stringify(activeProfile, null, 2)}
        onChange={(v) => {
          if (viewMode === "edit" && v != null) {
            updateDraftFromJson(v);
          }
        }}
        theme={theme === "dark" ? "tokyo-night" : "github-light"}
        beforeMount={(monaco) => {
          defineTokyoNightTheme(monaco);
          defineGithubLightTheme(monaco);
        }}
        options={{
          wordWrap: "on",
          readOnly: viewMode !== "edit",
          fontSize: 13,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          renderWhitespace: "selection",
          cursorSmoothCaretAnimation: "on",
          padding: { top: 8 },
        }}
      />

      {jsonError && <div className="bg-destructive/10 text-destructive text-xs p-2">JSON Error: {jsonError}</div>}
    </div>
  );
}
