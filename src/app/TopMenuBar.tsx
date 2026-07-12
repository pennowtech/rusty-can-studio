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
import { Command, HelpCircle, Settings } from "lucide-react";
import { useCommandPaletteStore } from "@/store/commandPaletteStore";
import { useConnectDialogStore } from "@/store/canConnectDialogStore";
import { useUiStore } from "@/store/uiStore";
import { useConnectionStore } from "@/store/connectionStore";

export function TopMenuBar() {
  const setView = useAppStore((s) => s.setView);
  const { setTheme } = useTheme();
  const toggleSidebarMode = useAppStore((s) => s.toggleSidebarMode);
  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const openConnectDialog = useConnectDialogStore((s) => s.openDialog);
  const openConnectionManager = useUiStore((s) => s.openConnectionManager);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const connectionStatus = useConnectionStore((s) => s.status);

  return (
    <div className="flex min-w-0 items-center border-b">
      <div className="flex items-center gap-1 px-2">
        <Button variant="ghost" size="icon" onClick={openPalette} title="Command Palette (Ctrl+Shift+P)">
          <Command className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" onClick={() => setView("settings")} title="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <Menubar className="shrink-0 rounded-none border-0">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              onClick={() => {
                setView("profile-editor");
              }}
            >
              Profile Editor
            </MenubarItem>
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
            <MenubarItem onClick={openConnectDialog}>Connect</MenubarItem>
            <MenubarItem disabled={connectionStatus === "disconnected"} onClick={() => void disconnect()}>
              Disconnect
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={openConnectionManager}>Manage Connections</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Help</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => setView("help")}>Open Help</MenubarItem>
            <MenubarItem>Documentation</MenubarItem>
            <MenubarItem>Keyboard Shortcuts</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>About</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="min-w-0 flex-1 truncate px-3 text-xs text-muted-foreground">
        Connect to remote can-bridge-daemon, define packet formats, and monitor sent/received packets.
      </div>

      <button onClick={() => setView("help")} className="mr-2 shrink-0 rounded p-1 hover:bg-muted" title="Help">
        <HelpCircle className="h-4 w-4" />
      </button>
    </div>
  );
}
