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
import { useI18nStore } from "@/i18n/i18nStore";
import { Button } from "@/components/ui/button";
import { Command, HelpCircle } from "lucide-react";
import { useCommandPaletteStore } from "@/store/commandPaletteStore";
import { useConnectDialogStore } from "@/store/canConnectDialogStore";
import { useUiStore } from "@/store/uiStore";
import { useConnectionStore } from "@/store/connectionStore";

export function TopMenuBar() {
  const setView = useAppStore((s) => s.setView);
  const t = useI18nStore((s) => s.t);
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
      </div>

      <Menubar className="shrink-0 rounded-none border-0">
        <MenubarMenu>
          <MenubarTrigger>{t("menu.file")}</MenubarTrigger>
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
          <MenubarTrigger>{t("menu.view")}</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={toggleSidebarMode}>Toggle Sidebar</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => setView("profile-editor")}>{t("nav.profileEditor")}</MenubarItem>
            <MenubarItem onClick={() => setView("monitor")}>{t("nav.monitor")}</MenubarItem>
            <MenubarItem onClick={() => setView("terminal")}>{t("nav.terminal")}</MenubarItem>
            <MenubarItem onClick={() => setView("simulator")}>{t("nav.simulator")}</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => setTheme("light")}>Appearance: Light</MenubarItem>
            <MenubarItem onClick={() => setTheme("dark")}>Appearance: Dark</MenubarItem>
            <MenubarItem onClick={() => setTheme("system")}>Appearance: System</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{t("menu.can")}</MenubarTrigger>
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
          <MenubarTrigger>{t("menu.help")}</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => setView("help")}>Open Help</MenubarItem>
            <MenubarItem onClick={() => setView("help")}>Documentation</MenubarItem>
            <MenubarItem onClick={() => setView("shortcuts")}>Keyboard Shortcuts</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => setView("about")}>About</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="min-w-0 flex-1 truncate px-3 text-xs text-muted-foreground">
        Connect to remote can-bridge-daemon, define packet formats, and monitor sent/received packets.
      </div>

      <button type="button" onClick={() => setView("help")} className="mr-2 shrink-0 rounded p-1 hover:bg-muted" title="Help">
        <HelpCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

