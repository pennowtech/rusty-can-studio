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
import { HelpShell } from "@/components/help-system/HelpShell";
import { useAppStore } from "@/store/appShellStore";
import { useConnectDialogStore } from "@/store/canConnectDialogStore";
import { useConnectionStore } from "@/store/connectionStore";
import { useHelpStore } from "@/components/help-system/store/helpStore";
import { useState } from "react";
// import { EditorShell } from "@/editor/EditorShell";

export function MainView() {
  const view = useAppStore((s) => s.view);

  const [connectOpen, setConnectOpen] = useState(false);
  const setHelpOpen = useHelpStore((s) => s.openHelp);
  const isHelpOpen = useHelpStore((s) => s.isOpen);

  switch (view) {
    case "profile-editor":
      return <div className="p-6 text-muted-foreground">Editor Shell (coming next)</div>;

    case "monitor":
      return <CanConnectionManagerDialog open={connectOpen} onOpenChange={setConnectOpen} />;

    case "simulator":
      return <div className="p-6 text-muted-foreground">CAN Simulator (TX) (coming next)</div>;

    case "settings":
      return <div className="p-6 text-muted-foreground">Settings</div>;

    case "help":
      // <Dialog open onOpenChange={close}>
      //   <DialogContent className="max-w-6xl h-[85vh] p-0">
      //     <HelpShell />
      //   </DialogContent>
      // </Dialog>
      return <HelpShell />;

    default:
      return null;
  }
}
