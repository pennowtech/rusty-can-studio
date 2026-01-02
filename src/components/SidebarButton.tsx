/**
 * SidebarButton.tsx
 * ------------------------------------------------------------
 * A button component for the application sidebar.
 *
 * RESPONSIBILITY
 * - Renders a button with an icon and label.
 * - Supports active and collapsed states.
 * - Handles click events.
 *
 * CONVENTIONS
 * - Icon is a React component passed as a prop.
 * - Label is displayed only when not collapsed.
 * - Active state changes the button's appearance.
 * - Collapsed state shows only the icon with a tooltip.
 * - onClick prop handles button clicks.
 *
 * UX NOTES
 * - Designed for sidebar navigation.
 * - Visual feedback for active state.
 * - Tooltip for collapsed state.
 *
 * HOW TO USE
 * - Import and use within a sidebar component.
 * - Pass appropriate props for icon, label, active state, collapsed state, and click handler.
 *
 * EXAMPLE
 * <SidebarButton
 *  icon={ActivityIcon}
 *  label="Monitor"
 *  active={view === "monitor"}
 *  collapsed={sidebarCollapsed}
 *  onClick={() => setView("monitor")}
 * />
 *
 */

export function SidebarButton({
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  icon: any;
  label: string;
  active?: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`
         flex items-center gap-2 rounded-md px-3 py-2 text-sm
         ${active ? "bg-muted font-medium" : "hover:bg-muted"}
         ${collapsed ? "justify-center px-2" : ""}
       `}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </button>
  );
}
