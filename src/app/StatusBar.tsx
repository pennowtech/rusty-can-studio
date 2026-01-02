/**
 * StatusBar.tsx
 * ------------------------------------------------------------
 * Global application status bar.
 *
 * RESPONSIBILITY
 * - Displays ambient application state:
 *   - Connection status
 *   - Active profile
 *   - RX/TX counters (future)
 *   - Error indicators
 * - Provides quick-glance, non-intrusive feedback
 *
 * CONVENTIONS
 * - MUST remain visually lightweight
 * - MUST NOT contain complex interactions
 * - SHOULD reflect state, not control it
 *
 * UX NOTES
 * - Always visible
 * - Clickable indicators may be added later
 */

import { useTheme } from "@/components/ThemeProvider";

export function StatusBar() {
  const { theme } = useTheme();
  return (
    <div className="h-6 border-t px-3 text-xs flex items-center justify-between text-muted-foreground">
      <div>● Disconnected</div>
      <div>Profile: None</div>
      <div>Theme: {theme}</div>
    </div>
  );
}
