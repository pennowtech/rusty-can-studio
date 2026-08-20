import { useHelpTocStore } from "@/components/help-system/store/useHelpTocStore";
import { Button } from "@/components/ui/button";
import { List, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useCallback, useState } from "react";
import clsx from "clsx";

export function HelpTOC() {
  const toc = useHelpTocStore((s) => s.toc);
  const scrollTo = useHelpTocStore((s) => s.scrollTo);
  const activeId = useHelpTocStore((s) => s.activeId);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(240);
  const [isDragging, setIsDragging] = useState(false);

  const startResizing = useCallback(
    (mouseDownEvent: React.MouseEvent) => {
      mouseDownEvent.preventDefault();
      setIsDragging(true);
      const startX = mouseDownEvent.clientX;
      const startWidth = width;

      const doDrag = (mouseMoveEvent: MouseEvent) => {
        const delta = startX - mouseMoveEvent.clientX;
        const newWidth = Math.min(Math.max(startWidth + delta, 160), 550);
        setWidth(newWidth);
      };

      const stopDrag = () => {
        setIsDragging(false);
        window.removeEventListener("mousemove", doDrag);
        window.removeEventListener("mouseup", stopDrag);
      };

      window.addEventListener("mousemove", doDrag);
      window.addEventListener("mouseup", stopDrag);
    },
    [width],
  );

  if (isCollapsed) {
    return (
      <div className="flex min-h-0 h-full w-10 shrink-0 flex-col items-center border-l bg-muted/10 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={() => setIsCollapsed(false)}
          title="Expand Table of Contents (Right)"
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside
      style={{ width: `${width}px` }}
      className={clsx(
        "relative flex flex-col space-y-2 p-2.5 sm:p-3 text-sm h-full min-h-0 shrink-0 border-l bg-muted/10 select-none",
        isDragging && "select-none transition-none border-primary/50",
      )}
    >
      <div
        onMouseDown={startResizing}
        onDoubleClick={() => setWidth(240)}
        className="absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
        title="Drag left/right to resize Table of Contents (Double click to reset)"
      />

      <div className="flex items-center justify-between gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary/80 border-b pb-2 shrink-0">
        <div className="flex items-center gap-1.5 truncate">
          <List className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Table of Contents</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 cursor-pointer text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => setIsCollapsed(true)}
          title="Collapse Table of Contents"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      <nav className="flex flex-col space-y-1 overflow-y-auto w-full min-h-0 flex-1">
        {toc.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => scrollTo(item.id)}
            className={clsx(
              "w-full cursor-pointer rounded-r-md px-2 py-1.5 text-left text-xs transition-all block truncate",
              activeId === item.id
                ? "bg-primary/10 text-primary font-semibold border-l-2 border-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              item.level === 1 && "font-semibold text-foreground border-l-2 border-primary/40",
              item.level === 2 && "ml-2 sm:ml-2.5",
              item.level === 3 && "ml-3 sm:ml-4 text-[11px] opacity-90",
            )}
          >
            {item.text}
          </button>
        ))}
      </nav>
    </aside>
  );
}
