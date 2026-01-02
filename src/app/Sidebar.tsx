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
import { useHelpStore } from "@/store/helpStore";
import { Activity, Sliders, Edit3, Settings, PanelLeftClose, PanelLeftOpen, HelpCircleIcon } from "lucide-react";

export function Sidebar() {
  const { view, setView, sidebarMode, toggleSidebarMode } = useAppStore();

  const collapsed = sidebarMode === "icon";

  return (
    <div
      className={`
         border-r p-2 space-y-2 transition-all
         ${collapsed ? "w-14" : "w-56"}
       `}
    >
      {/* TOGGLE BUTTON */}
      <button
        onClick={toggleSidebarMode}
        className="mb-2 flex justify-content-right w-full rounded-md p-2 hover:bg-muted"
        title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>

      <SidebarButton
        icon={Activity}
        label="CAN Monitor"
        active={view === "monitor"}
        collapsed={collapsed}
        onClick={() => setView("monitor")}
      />

      <SidebarButton
        icon={Sliders}
        label="Simulator"
        active={view === "simulator"}
        collapsed={collapsed}
        onClick={() => setView("simulator")}
      />

      <SidebarButton
        icon={Edit3}
        label="Profile Editor"
        active={view === "profile-editor"}
        collapsed={collapsed}
        onClick={() => setView("profile-editor")}
      />

      <SidebarButton
        icon={Settings}
        label="Settings"
        active={view === "settings"}
        collapsed={collapsed}
        onClick={() => setView("settings")}
      />

      <SidebarButton
        icon={HelpCircleIcon}
        label="Help"
        active={view === "help"}
        collapsed={collapsed}
        onClick={() => {
          setView("help");
        }}
      />
    </div>
  );
}
