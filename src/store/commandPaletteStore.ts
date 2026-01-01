/**
 * commandPaletteStore.ts
 * ------------------------------------------------------------
 * Command palette state store.
 *
 * RESPONSIBILITY
 * - Manages the open/closed state of the command palette.
 * - Provides methods to open and close the palette.
 *
 * CONVENTIONS
 * - Zustand store
 * - No derived or computed state
 * - Pure UI concerns only
 *
 * HOW TO USE
 * - Import the store using `useCommandPaletteStore`.
 * - Call `openPalette` to open the command palette.
 * - Call `closePalette` to close the command palette.
 */

import { create } from "zustand";

type CommandPaletteState = {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
};

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
}));
