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

import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appShellStore";
import { Activity, Sliders, Edit3, Settings, BadgeHelpIcon, HelpCircleIcon } from "lucide-react";

function SidebarButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: any;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
        active ? "bg-muted font-medium" : "hover:bg-muted",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export function Sidebar() {
  const { view, setView, sidebarOpen } = useAppStore();

  if (!sidebarOpen) return null;

  return (
    <div className="w-56 border-r p-2 space-y-2">
      <SidebarButton
        icon={Activity}
        label="CAN Monitor"
        active={view === "monitor"}
        onClick={() => setView("monitor")}
      />
      <SidebarButton
        icon={Sliders}
        label="Simulator"
        active={view === "simulator"}
        onClick={() => setView("simulator")}
      />
      <SidebarButton
        icon={Edit3}
        label="Profile Editor"
        active={view === "profile-editor"}
        onClick={() => setView("profile-editor")}
      />
      <SidebarButton
        icon={Settings}
        label="Settings"
        active={view === "settings"}
        onClick={() => setView("settings")}
      />
      <SidebarButton icon={HelpCircleIcon} label="Help" active={view === "help"} onClick={() => setView("help")} />
    </div>
  );
}
