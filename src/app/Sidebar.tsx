/**
 * Sidebar.tsx
 * ------------------------------------------------------------
 * Primary application navigation sidebar.
 *
 * RESPONSIBILITY
 * - Allows switching between major app views:
 *   - CAN Monitor
 *   - Simulator
 *   - Profile Editor
 *   - Settings
 *   - Help
 * - Reflects the current active view
 * - Acts as the main tool switcher for the application
 *
 * CONVENTIONS
 * - MUST NOT render editor internals
 * - MUST NOT manage view state directly (delegates to appStore)
 * - MUST NOT  handle business logic
 * - SHOULD remain icon-first and compact
 * - Collapsing behavior is controlled externally
 *
 * UX NOTES
 * - Icon-first
 * - VS Code–inspired
 * - Collapsible
 */
import { SidebarButton } from "@/components/SidebarButton";
import { useAppStore } from "@/store/appShellStore";
import {
  Activity,
  Terminal,
  Sliders,
  Edit3,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  HelpCircleIcon,
} from "lucide-react";

export function Sidebar() {
  const { view, setView, sidebarMode, toggleSidebarMode } = useAppStore();

  const collapsed = sidebarMode === "icon";
  const primaryItems = [
    { icon: Activity, label: "CAN Monitor", view: "monitor" as const },
    { icon: Terminal, label: "Terminal Trace", view: "terminal" as const },
    { icon: Sliders, label: "Simulator", view: "simulator" as const },
  ];
  const profileItems = [
    { icon: Edit3, label: "Profile Editor", view: "profile-editor" as const },
  ];
  const supportItems = [
    { icon: Settings, label: "Settings", view: "settings" as const },
    { icon: HelpCircleIcon, label: "Help", view: "help" as const },
  ];

  return (
    <div
      className={`
         flex min-h-0 flex-col border-r bg-muted/20 p-2 transition-all
         ${collapsed ? "w-14" : "w-56"}
       `}
    >
      <button
        onClick={toggleSidebarMode}
        className="mb-3 flex w-full items-center justify-center rounded-md border border-transparent p-2 text-muted-foreground hover:bg-background hover:text-foreground"
        title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>

      <nav className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="space-y-1">
          {!collapsed && <div className="px-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">Workspace</div>}
          {primaryItems.map((item) => (
            <SidebarButton
              key={item.view}
              icon={item.icon}
              label={item.label}
              active={view === item.view}
              collapsed={collapsed}
              onClick={() => setView(item.view)}
            />
          ))}
        </div>

        <div className="space-y-1">
          {!collapsed && <div className="px-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">Profiles</div>}
          {profileItems.map((item) => (
            <SidebarButton
              key={item.view}
              icon={item.icon}
              label={item.label}
              active={view === item.view}
              collapsed={collapsed}
              onClick={() => setView(item.view)}
            />
          ))}
        </div>

        <div className="mt-auto space-y-1">
          {!collapsed && <div className="px-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">System</div>}
          {supportItems.map((item) => (
            <SidebarButton
              key={item.view}
              icon={item.icon}
              label={item.label}
              active={view === item.view}
              collapsed={collapsed}
              onClick={() => setView(item.view)}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}
