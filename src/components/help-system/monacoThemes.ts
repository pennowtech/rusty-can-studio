import type * as monaco from "monaco-editor";

/**
 * Tokyo Night (Dark)
 * Based on official Tokyo Night colors
 */
export function defineTokyoNightTheme(m: typeof monaco) {
  m.editor.defineTheme("tokyo-night", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "565f89", fontStyle: "italic" },
      { token: "string", foreground: "9ece6a" },
      { token: "keyword", foreground: "bb9af7" },
      { token: "number", foreground: "ff9e64" },
      { token: "variable", foreground: "c0caf5" },
      { token: "type.identifier", foreground: "7dcfff" },
    ],
    colors: {
      "editor.background": "#1a1b26",
      "editor.foreground": "#c0caf5",
      "editorLineNumber.foreground": "#3b4261",
      "editorCursor.foreground": "#c0caf5",
      "editor.selectionBackground": "#33467c",
      "editor.lineHighlightBackground": "#1f2335",
    },
  });
}

/**
 * GitHub Light
 */
export function defineGithubLightTheme(m: typeof monaco) {
  m.editor.defineTheme("github-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6a737d", fontStyle: "italic" },
      { token: "string", foreground: "032f62" },
      { token: "keyword", foreground: "d73a49" },
      { token: "number", foreground: "005cc5" },
      { token: "variable", foreground: "24292e" },
      { token: "type.identifier", foreground: "005cc5" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#24292e",
      "editorLineNumber.foreground": "#959da5",
      "editorCursor.foreground": "#24292e",
      "editor.selectionBackground": "#cce5ff",
      "editor.lineHighlightBackground": "#f6f8fa",
    },
  });
}
