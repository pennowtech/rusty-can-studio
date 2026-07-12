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
import { commandRegistry } from "@/commands/registry";
import { defaultShortcuts, shortcutMatches, useShortcutStore } from "@/commands/shortcutStore";
import { useAppStore } from "@/store/appShellStore";
import { useTheme } from "@/components/ThemeProvider";
import { useConnectDialogStore } from "@/store/canConnectDialogStore";
import { useUiStore } from "@/store/uiStore";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

export function useCommandPaletteHotkey() {
  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const closePalette = useCommandPaletteStore((s) => s.closePalette);
  const paletteOpen = useCommandPaletteStore((s) => s.open);
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const setView = useAppStore((s) => s.setView);
  const { setTheme } = useTheme();
  const openConnectDialog = useConnectDialogStore((s) => s.openDialog);
  const openConnectionManager = useUiStore((s) => s.openConnectionManager);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target) && !paletteOpen) return;
      const command = commandRegistry.find((cmd) => shortcutMatches(e, shortcuts[cmd.id] ?? defaultShortcuts[cmd.id] ?? cmd.shortcut ?? ""));
      if (!command) return;

      e.preventDefault();
      command.handler({ setView, setTheme, openConnectDialog, openConnectionManager, openPalette });
      if (paletteOpen && command.id !== "app.commandPalette") closePalette();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePalette, openConnectDialog, openConnectionManager, openPalette, paletteOpen, setTheme, setView, shortcuts]);
}
