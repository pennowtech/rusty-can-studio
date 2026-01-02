/**
 * App.tsx
 * ------------------------------------------------------------
 * Root application entry point.
 *
 * RESPONSIBILITY
 * - Acts as the single React root for the Tauri application
 * - Mounts the AppShell (global layout + navigation)
 * - Does NOT contain routing, state, or business logic
 *
 * CONVENTIONS
 * - MUST remain minimal
 * - No CAN, editor, or transport logic
 * - No state, no side effects
 *
 * NOTE
 * - All global UI structure lives in AppShell
 */

import { AppShell } from "@/app/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
