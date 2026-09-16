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
export type AppView = "monitor" | "terminal" | "simulator" | "profile-editor" | "settings" | "help" | "shortcuts";

// Define the shape of the application shell state
// - includes current view
// - includes methods to update the state
// Sidebar collapse state used to live here (as sidebarMode/toggleSidebarMode)
// but was never persisted, so it silently reset to collapsed on every
// reload — moved to @sbt/desktop-kit's useNavRailStore (nav/navRailStore.ts)
// as part of Phase B, which persists it correctly and is shared with
// FlexMQTT's nav rail too.
// About used to be a full-page view ("about") — replaced by the shared
// AppAboutDialog modal (also Phase B), triggered from multiple places
// (Sidebar's logo, the command palette), so its open state lives here
// rather than duplicated per trigger.
export type AppState = {
  view: AppView;
  isMobile: boolean;
  aboutOpen: boolean;

  setView: (view: AppView) => void;
  setIsMobile: (v: boolean) => void;
  setAboutOpen: (open: boolean) => void;
};

// Create the Zustand store for application shell state
// - manages active view
// - provides mobile detection state
// - provides methods to update state
// - initial view is "monitor"
// - no derived state, pure UI concerns
export const useAppStore = create<AppState>((set) => ({
  view: "monitor",
  isMobile: false,
  aboutOpen: false,

  setView: (view) => set({ view }),

  setIsMobile: (v) => set({ isMobile: v }),

  setAboutOpen: (open) => set({ aboutOpen: open }),
}));
