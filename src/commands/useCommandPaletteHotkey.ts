/**
 * useCommandPaletteHotkey.ts
 * ------------------------------------------------------------
 * Adds a global keyboard shortcut (Ctrl+Shift+P or Cmd+Shift+P) to open the command palette.
 *
 * RESPONSIBILITY
 * - Listens for specific keyboard events.
 * - Opens the command palette when the shortcut is detected.
 *
 * CONVENTIONS
 * - Uses React's useEffect to manage event listeners.
 * - Detects platform to differentiate between Ctrl and Cmd keys.
 * - Relies on the command palette store for state management.
 *
 * HOW TO USE
 * - Import and call this hook in a top-level component (e.g., App component).
 * - Ensure the command palette store is properly set up.
 */
import { useEffect } from "react";
import { useCommandPaletteStore } from "@/store/commandPaletteStore";

export function useCommandPaletteHotkey() {
  const open = useCommandPaletteStore((s) => s.openPalette);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.includes("Mac");

      if ((isMac && e.metaKey && e.shiftKey && e.key === "P") || (!isMac && e.ctrlKey && e.shiftKey && e.key === "P")) {
        e.preventDefault();
        open();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
}
