// Vite raw CSS imports (bundled locally)
import githubLightCss from "highlight.js/styles/github.min.css?inline";
import githubDarkCss from "highlight.js/styles/github-dark.min.css?inline";

let styleEl: HTMLStyleElement | null = null;
export function applyHighlightTheme(theme: "light" | "dark") {
  const css = theme === "dark" ? githubDarkCss : githubLightCss;

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.setAttribute("data-hljs", "true");
    document.head.appendChild(styleEl);
  }

  if (styleEl.textContent !== css) {
    styleEl.textContent = css;
  }
}
