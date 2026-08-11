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

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

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
  const buttonEl = (
    <button type="button"
      onClick={onClick}
      className={`
         relative group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200
         ${active 
           ? "bg-primary/10 text-primary border border-primary/20 shadow-sm" 
           : "border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
         }
         ${collapsed ? "justify-center px-0 h-9 w-9 mx-auto" : "h-9"}
       `}
    >
      {/* Active left indicator line */}
      {active && !collapsed && (
        <span className="absolute left-0.5 top-2 bottom-2 w-0.75 rounded-full bg-primary" style={{ width: "3px" }} />
      )}
      <Icon className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex justify-center">
            {buttonEl}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={12}>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return buttonEl;
}
