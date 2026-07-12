import { defineGithubLightTheme, defineTokyoNightTheme } from "@/components/help-system/monacoThemes";
import { useTheme } from "@/components/ThemeProvider";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { Editor } from "@monaco-editor/react";

export function ProfileJsonView() {
  const { updateDraftFromJson, draftProfile, profile, jsonError } = useProfileStore();
  const activeProfile = draftProfile ?? profile;
  const { resolvedTheme } = useTheme();

  return (
    <div className="h-full border rounded-lg overflow-hidden">
      <Editor
        height="100%"
        language="json"
        value={JSON.stringify(activeProfile, null, 2)}
        onChange={(v) => {
          if (draftProfile && v != null) {
            updateDraftFromJson(v);
          }
        }}
        theme={resolvedTheme === "dark" ? "tokyo-night" : "github-light"}
        beforeMount={(monaco) => {
          defineTokyoNightTheme(monaco);
          defineGithubLightTheme(monaco);
        }}
        options={{
          wordWrap: "on",
          readOnly: !draftProfile,
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

      {jsonError && <div className="bg-destructive/10 text-destructive text-xs p-2">JSON Error: {jsonError}</div>}
    </div>
  );
}
