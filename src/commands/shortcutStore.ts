import { create } from "zustand";

export const defaultShortcuts: Record<string, string> = {
  "app.commandPalette": "Ctrl+Shift+P",
  "view.monitor": "Ctrl+1",
  "view.terminalTrace": "Ctrl+3",
  "view.profileEditor": "Ctrl+2",
  "view.settings": "Ctrl+,",
  "help.user.documentation": "F1",
  "help.shortcuts": "Ctrl+/",
};

type ShortcutState = {
  shortcuts: Record<string, string>;
  setShortcut: (commandId: string, shortcut: string) => void;
  resetShortcut: (commandId: string) => void;
  resetAllShortcuts: () => void;
};

const storageKey = "cansim.shortcuts.v1";

function readStoredShortcuts() {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(storageKey);
    return value ? (JSON.parse(value) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeStoredShortcuts(shortcuts: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(shortcuts));
}

function normalizeShortcut(shortcut: string) {
  return shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "control") return "Ctrl";
      if (lower === "cmd" || lower === "command" || lower === "meta") return "Meta";
      if (lower === "option") return "Alt";
      if (lower === "esc") return "Escape";
      if (part.length === 1) return part.toUpperCase();
      return part[0].toUpperCase() + part.slice(1);
    })
    .join("+");
}

export function formatShortcutFromEvent(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "key">) {
  const key = event.key === " " ? "Space" : event.key;
  const lowerKey = key.toLowerCase();
  const parts = [
    event.ctrlKey ? "Ctrl" : "",
    event.metaKey ? "Meta" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
  ].filter(Boolean);

  if (!["control", "meta", "alt", "shift"].includes(lowerKey)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key);
  }

  return parts.join("+");
}

export function shortcutMatches(event: KeyboardEvent, shortcut: string) {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return false;
  return formatShortcutFromEvent(event) === normalized;
}

export function displayShortcut(shortcuts: Record<string, string>, commandId: string) {
  return normalizeShortcut(shortcuts[commandId] ?? defaultShortcuts[commandId] ?? "");
}

export function shortcutConflicts(shortcuts: Record<string, string>) {
  const active = { ...defaultShortcuts, ...shortcuts };
  const seen = new Map<string, string>();
  const conflicts = new Set<string>();
  Object.entries(active).forEach(([commandId, shortcut]) => {
    const normalized = normalizeShortcut(shortcut);
    if (!normalized) return;
    const existing = seen.get(normalized);
    if (existing) {
      conflicts.add(existing);
      conflicts.add(commandId);
    } else {
      seen.set(normalized, commandId);
    }
  });
  return conflicts;
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  shortcuts: readStoredShortcuts(),
  setShortcut: (commandId, shortcut) => {
    const shortcuts = { ...get().shortcuts, [commandId]: normalizeShortcut(shortcut) };
    writeStoredShortcuts(shortcuts);
    set({ shortcuts });
  },
  resetShortcut: (commandId) => {
    const shortcuts = { ...get().shortcuts };
    delete shortcuts[commandId];
    writeStoredShortcuts(shortcuts);
    set({ shortcuts });
  },
  resetAllShortcuts: () => {
    writeStoredShortcuts({});
    set({ shortcuts: {} });
  },
}));
