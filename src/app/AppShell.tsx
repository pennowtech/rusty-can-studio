/**
 * AppShell.tsx
 * ------------------------------------------------------------
 * Global application shell layout.
 *
 * RESPONSIBILITY
 * - Defines the permanent UI structure:
 *   - Top menu bar
 *   - Sidebar
 *   - Main content area
 *   - Status bar
 * - Owns layout composition ONLY
 * - Hosts view-level routing (Monitor / Editor / Simulator)
 *
 * CONVENTIONS
 * - MUST NOT contain view-specific logic
 * - MUST NOT manage application state
 * - MUST NOT directly reference editor or CAN internals
 * - Pure composition component
 *
 * CONVENTIONS
 * - Pure layout composition
 * - Must stay readable and declarative
 */

import { TopMenuBar } from "./TopMenuBar";
import { Sidebar } from "./Sidebar";
import { MainView } from "./MainView";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "@/commands/CommandPalette";
import { useCommandPaletteHotkey } from "@/commands/useCommandPaletteHotkey";
import { CanConnectDialog } from "@/components/CanConnectDialog";
import { useConnectDialogStore } from "@/store/canConnectDialogStore";
import { useUiStore } from "@/store/uiStore";
import { CanConnectionManagerDialog } from "@/components/CanConnectionManagerDialog";
import { useConnectionStore } from "@/store/connectionStore";
import { useEffect } from "react";

export function AppShell() {
  // Hook to enable command palette hotkey
  useCommandPaletteHotkey();
  const { open, closeDialog } = useConnectDialogStore();
  const { connectionManagerOpen, closeConnectionManager } = useUiStore();
  const disconnect = useConnectionStore((s) => s.disconnect);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void disconnect();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void disconnect();
    };
  }, [disconnect]);

  return (
    <>
      <div className="flex h-screen flex-col">
        <TopMenuBar />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="hidden md:block">
            <Sidebar />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <MainView />
          </div>
        </div>

        <StatusBar />
      </div>
      <CommandPalette />
      <CanConnectDialog open={open} onOpenChange={closeDialog} />
      <CanConnectionManagerDialog
        open={connectionManagerOpen}
        onOpenChange={(v) => (v ? null : closeConnectionManager())}
      />
    </>
  );
}
