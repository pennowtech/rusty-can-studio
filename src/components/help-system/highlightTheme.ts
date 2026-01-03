// Vite raw CSS imports (bundled locally)
import githubLightCss from "highlight.js/styles/a11y-light.min.css?inline";
import githubDarkCss from "highlight.js/styles/tokyo-night-dark.min.css?inline";

let styleEl: HTMLStyleElement | null = null;
export function applyHighlightTheme(theme: "light" | "dark" | "system") {
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
