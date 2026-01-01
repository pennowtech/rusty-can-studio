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

// TopMenuBar component
// - Renders the application top menu bar
// - Provides File, View, and Help menus
// - Delegates actions to app store methods
// - No direct business logic or state management
// - State management is handled via appShellStore
// - Keyboard accessible
export function TopMenuBar() {
  const setView = useAppStore((s) => s.setView);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  return (
    <Menubar className="rounded-none border-b">
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
          <MenubarItem onClick={toggleSidebar}>Toggle Sidebar</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => setView("profile-editor")}>Profile Editor</MenubarItem>
          <MenubarItem onClick={() => setView("monitor")}>CAN Monitor</MenubarItem>
          <MenubarItem onClick={() => setView("simulator")}>CAN Simulator</MenubarItem>
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
  );
}
