/**
 * TopMenuBar.tsx
 * ------------------------------------------------------------
 * Application-wide top menu bar.
 *
 * RESPONSIBILITY
 * - Renders the main application menu (File, View, Help, etc.)
 * - Exposes global commands:
 *   - File operations
 *   - View switching
 *   - Help / About
 * - Provides discoverability for command palette actions
 *
 * CONVENTIONS
 * - MUST NOT contain business logic
 * - MUST NOT directly perform file IO or CAN actions
 * - MUST NOT execute business logic directly
 * - Menu items should map to commands or app-store actions
 * - Actual behavior is delegated elsewhere
 * - Keyboard accessibility is mandatory
 * - Maintain state
 *
 */

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { useAppStore } from "@/store/appShellStore";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Command, Settings } from "lucide-react";
import { useCommandPaletteStore } from "@/store/commandPaletteStore";
import { useConnectDialogStore } from "@/store/canConnectDialogStore";
import { useUiStore } from "@/store/uiStore";

// TopMenuBar component
// - Renders the application top menu bar
// - Provides File, View, and Help menus
// - Delegates actions to app store methods
// - No direct business logic or state management
// - State management is handled via appShellStore
// - Keyboard accessible
export function TopMenuBar() {
  const setView = useAppStore((s) => s.setView);
  const { setTheme } = useTheme();
  const toggleSidebarMode = useAppStore((s) => s.toggleSidebarMode);
  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const openConnectDialog = useConnectDialogStore((s) => s.openDialog);
  const openConnectionManager = useUiStore((s) => s.openConnectionManager);

  return (
    <div className="flex items-center border-b">
      {/* LEFT ICON BUTTONS */}
      <div className="flex items-center gap-1 px-2">
        <Button variant="ghost" size="icon" onClick={openPalette} title="Command Palette (Ctrl+Shift+P)">
          <Command className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" onClick={() => setView("settings")} title="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* MENUS */}
      <Menubar className="rounded-none border-0 flex-1">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Open Profile…</MenubarItem>
            <MenubarItem>Save Profile</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Exit</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={toggleSidebarMode}>Toggle Sidebar</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => setView("profile-editor")}>Profile Editor</MenubarItem>
            <MenubarItem onClick={() => setView("monitor")}>CAN Monitor</MenubarItem>
            <MenubarItem onClick={() => setView("simulator")}>CAN Simulator</MenubarItem>
            <MenubarSeparator />

            <MenubarItem onClick={() => setTheme("light")}>Appearance: Light</MenubarItem>
            <MenubarItem onClick={() => setTheme("dark")}>Appearance: Dark</MenubarItem>
            <MenubarItem onClick={() => setTheme("system")}>Appearance: System</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>CAN</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={openConnectDialog}>Connect…</MenubarItem>
            <MenubarItem disabled>Disconnect</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => openConnectionManager()}>Manage Connections…</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Help</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Documentation</MenubarItem>
            <MenubarItem>Keyboard Shortcuts</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>About</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </div>
  );
}
