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

import { CanConnectionManagerDialog } from "@/components/CanConnectionManagerDialog";
import { useTheme } from "@/components/ThemeProvider";
import { useConnectionStore } from "@/store/connectionStore";
import { useState } from "react";

export function StatusBar() {
  const { theme } = useTheme();
  const { profiles, activeId } = useConnectionStore();
  const active = profiles.find((p) => p.id === activeId);

  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="h-6 border-t px-3 text-xs flex items-center justify-between text-muted-foreground">
        <div>● Disconnected</div>
        <div>Profile: None</div>
        <div>Theme: {theme}</div>
        <button className="hover:underline" onClick={() => setOpen(true)}>
          {active ? `🟢 ${active.name}` : "🔴 Disconnected"}
        </button>
      </div>
      <CanConnectionManagerDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
