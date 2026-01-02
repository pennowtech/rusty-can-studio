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

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const getInitialTheme = (): Theme => {
  try {
    return (localStorage.getItem(STORAGE_KEY.THEME) as Theme) ?? "system";
  } catch {
    return "system";
  }
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.add(prefersDark ? "dark" : "light");
    } else {
      root.classList.add(theme);
    }

    localStorage.setItem(STORAGE_KEY.THEME, theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
