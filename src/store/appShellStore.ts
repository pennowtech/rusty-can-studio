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

// Define the shape of the application shell state
// - includes current view and sidebar visibility
// - includes methods to update the state
export type AppState = {
  view: AppView;
  sidebarOpen: boolean;

  setView: (view: AppView) => void;
  toggleSidebar: () => void;
};

// Create the Zustand store for application shell state
// - manages active view and sidebar visibility
// - provides methods to update state
// - initial view is "monitor" and sidebar is open by default
// - no derived state, pure UI concerns
export const useAppStore = create<AppState>((set) => ({
  view: "monitor",
  sidebarOpen: true,

  setView: (view) => set({ view }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
