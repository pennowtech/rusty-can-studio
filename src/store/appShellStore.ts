/**
 * appShellStore.ts
 * ------------------------------------------------------------
 * Application shell state store.
 *
 * RESPONSIBILITY
 * - Manages global UI-level application state:
 *   - Active main view
 *   - Sidebar visibility
 * - Coordinates navigation across top-level views
 * Rule: App shell state never mixes with editor state.
 *
 * CONVENTIONS
 * - MUST NOT contain editor-specific state
 * - MUST NOT contain CAN runtime state
 * - MUST NOT store persistent settings
 * - SHOULD remain small and stable
 *
 * CONVENTIONS
 * - Zustand store
 * - No derived or computed state
 * - Pure UI concerns only
 *
 * HOW TO USE
 * - Import the store using `useAppStore`.
 * - Access state and methods as needed.
 */

import { create } from "zustand";

// Define the possible main application views
export type AppView = "monitor" | "simulator" | "profile-editor" | "settings" | "help";

type SidebarMode = "expanded" | "icon";

// Define the shape of the application shell state
// - includes current view and sidebar mode
// - includes methods to update the state
export type AppState = {
  view: AppView;
  sidebarMode: SidebarMode;

  setView: (view: AppView) => void;
  toggleSidebarMode: () => void;
};

// Create the Zustand store for application shell state
// - manages active view and sidebar mode
// - provides methods to update state
// - initial view is "monitor" and sidebar is "expanded"
// - no derived state, pure UI concerns
export const useAppStore = create<AppState>((set) => ({
  view: "monitor",
  sidebarMode: "expanded",

  setView: (view) => set({ view }),

  toggleSidebarMode: () =>
    set((s) => ({
      sidebarMode: s.sidebarMode === "expanded" ? "icon" : "expanded",
    })),
}));
