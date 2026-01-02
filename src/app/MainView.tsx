/**
 * MainView.tsx
 * ------------------------------------------------------------
 * Main content router for the application shell.
 *
 * RESPONSIBILITY
 * - Selects which high-level view is rendered:
 *   - CAN Monitor
 *   - CAN Simulator
 *   - Profile Editor
 *   - Settings
 * - Acts as a lightweight view switcher
 * - based on the current AppShell state
 *
 * CONVENTIONS
 * - MUST NOT contain routing libraries (v1)
 * - MUST NOT contain layout chrome
 * - SHOULD keep switch logic explicit and readable
 * - Views must preserve their internal state across switches
 * - Explicit switch-based routing (v1)
 * - No React Router dependency
 */

import { CanConnectionManagerDialog } from "@/components/CanConnectionManagerDialog";
import { useAppStore } from "@/store/appShellStore";
import { useConnectDialogStore } from "@/store/canConnectDialogStore";
import { useConnectionStore } from "@/store/connectionStore";
import { useState } from "react";
// import { EditorShell } from "@/editor/EditorShell";

export function MainView() {
  const view = useAppStore((s) => s.view);

  const [open, setOpen] = useState(false);

  switch (view) {
    case "profile-editor":
      return <div className="p-6 text-muted-foreground">Editor Shell (coming next)</div>;

    case "monitor":
      return <CanConnectionManagerDialog open={open} onOpenChange={setOpen} />;

    case "simulator":
      return <div className="p-6 text-muted-foreground">CAN Simulator (TX) (coming next)</div>;

    case "settings":
      return <div className="p-6 text-muted-foreground">Settings</div>;

    case "help":
      return <div className="p-6 text-muted-foreground">Help</div>;

    default:
      return null;
  }
}
