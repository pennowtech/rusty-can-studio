/**
 * ThemeProvider.tsx
 * ------------------------------------------------------------
 * Provides theme context and management for the application.
 *
 * RESPONSIBILITY
 * - Manages light, dark, and system themes
 * - Persists user theme preference in localStorage
 * - Applies theme classes to the document root
 * - Provides a context for accessing and updating the theme
 *
 * CONVENTIONS
 * - Uses React Context API
 * - Theme values: "light", "dark", "system"
 * - Side effects handled in useEffect
 *
 * HOW TO USE
 * - Wrap the application with <ThemeProvider>
 * - Use useTheme hook to access and update the theme
 */

import { STORAGE_KEY } from "@/utils/consts";
import * as React from "react";
import { createContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type ThemePalette = "default" | "graphite" | "zeiss-blue" | "high-contrast" | "terminal" | "warm-neutral" | "signal-deck" | "rusty-studio";
export type ThemeDensity = "comfortable" | "compact" | "dense";

export type AppearanceSettings = {
  theme: Theme;
  palette: ThemePalette;
  density: ThemeDensity;
};

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  palette: ThemePalette;
  density: ThemeDensity;
  setTheme: (theme: Theme) => void;
  setPalette: (palette: ThemePalette) => void;
  setDensity: (density: ThemeDensity) => void;
  setAppearance: (appearance: Partial<AppearanceSettings>) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const defaultAppearance: AppearanceSettings = {
  theme: "light",
  palette: "signal-deck",
  density: "comfortable",
};

const palettes: ThemePalette[] = ["default", "graphite", "zeiss-blue", "high-contrast", "terminal", "warm-neutral", "signal-deck", "rusty-studio"];
const densities: ThemeDensity[] = ["comfortable", "compact", "dense"];

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function isPalette(value: unknown): value is ThemePalette {
  return palettes.includes(value as ThemePalette);
}

function isDensity(value: unknown): value is ThemeDensity {
  return densities.includes(value as ThemeDensity);
}

const getInitialAppearance = (): AppearanceSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY.THEME);
    if (!raw) return defaultAppearance;
    if (raw === "light" || raw === "dark" || raw === "system") return { ...defaultAppearance, theme: raw };
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>;
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : defaultAppearance.theme,
      palette: isPalette(parsed.palette) ? parsed.palette : defaultAppearance.palette,
      density: isDensity(parsed.density) ? parsed.density : defaultAppearance.density,
    };
  } catch {
    return defaultAppearance;
  }
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearanceState] = useState<AppearanceSettings>(getInitialAppearance);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = window.document.documentElement;

    const apply = () => {
      root.classList.remove("light", "dark");
      root.classList.remove(...palettes.map((palette) => `theme-${palette}`));
      root.classList.remove(...densities.map((density) => `density-${density}`));

      const nextResolvedTheme =
        appearance.theme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : appearance.theme;

      // data-theme drives our own palette CSS (index.css), matching the
      // light/dark switching mechanism used elsewhere on this account (see
      // MQTTX desktop-next's themeStore). The "dark"/"light" class is ALSO
      // set, purely so Tailwind's `dark:` utility variant keeps working —
      // Tailwind's `darkMode: ["selector", '[data-theme="dark"]']` option
      // (tried first) silently drops unrelated hand-authored @layer base
      // rules that appear near a rule using that same selector text, a
      // real bug in tailwindcss 3.4.19, confirmed with an isolated repro.
      root.setAttribute("data-theme", nextResolvedTheme);
      root.classList.add(nextResolvedTheme);
      root.classList.add(`theme-${appearance.palette}`);
      root.classList.add(`density-${appearance.density}`);
      setResolvedTheme(nextResolvedTheme);
    };

    apply();
    localStorage.setItem(STORAGE_KEY.THEME, JSON.stringify(appearance));

    if (appearance.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance]);

  const value: ThemeContextValue = {
    theme: appearance.theme,
    resolvedTheme,
    palette: appearance.palette,
    density: appearance.density,
    setTheme: (theme) => setAppearanceState((current) => ({ ...current, theme })),
    setPalette: (palette) => setAppearanceState((current) => ({ ...current, palette })),
    setDensity: (density) => setAppearanceState((current) => ({ ...current, density })),
    setAppearance: (next) => setAppearanceState((current) => ({ ...current, ...next })),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
