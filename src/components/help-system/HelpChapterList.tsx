import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useHelpContentStore } from "@/components/help-system/store/helpContentStore";
import { BookOpen, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import clsx from "clsx";

export function HelpChapterList() {
  const chapters = useHelpContentStore((s) => s.chapters);
  const selectedChapterId = useHelpContentStore((s) => s.selectedChapterId);
  const selectChapter = useHelpContentStore((s) => s.selectChapter);
  const [query, setQuery] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(240);
  const [isDragging, setIsDragging] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();

  const startResizing = useCallback(
    (mouseDownEvent: React.MouseEvent) => {
      mouseDownEvent.preventDefault();
      setIsDragging(true);
      const startX = mouseDownEvent.clientX;
      const startWidth = width;

      const doDrag = (mouseMoveEvent: MouseEvent) => {
        const delta = mouseMoveEvent.clientX - startX;
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

  const visibleChapters = useMemo(
    () =>
      chapters.filter((chapter) => {
        if (!normalizedQuery) return true;
        return `${chapter.title} ${chapter.markdown}`.toLowerCase().includes(normalizedQuery);
      }),
    [chapters, normalizedQuery],
  );

  if (isCollapsed) {
    return (
      <aside className="flex min-h-0 h-full w-10 shrink-0 flex-col items-center border-r bg-muted/20 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={() => setIsCollapsed(false)}
          title="Expand Help Library (Left)"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside
      style={{ width: `${width}px` }}
      className={clsx(
        "relative flex min-h-0 h-full shrink-0 flex-col border-r bg-muted/20 select-none",
        isDragging && "select-none transition-none border-primary/50",
      )}
    >
      <div
        onMouseDown={startResizing}
        onDoubleClick={() => setWidth(240)}
        className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
        title="Drag left/right to resize Help Library (Double click to reset)"
      />

      <div className="border-b p-2.5 sm:p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold truncate">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Help library</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 cursor-pointer text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setIsCollapsed(true)}
            title="Collapse Help Library"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative mt-2.5 sm:mt-3">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="h-8 pl-8 text-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find chapter" />
        </div>
      </div>

      <nav className="flex flex-col gap-1 overflow-y-auto p-2 min-h-0 flex-1 w-full">
        {visibleChapters.map((chapter) => (
          <button type="button"
            key={chapter.id}
            onClick={() => selectChapter(chapter.id)}
            className={clsx(
              "w-full rounded-md border px-2.5 py-2 text-left text-xs sm:text-sm transition hover:bg-background",
              selectedChapterId === chapter.id ? "border-primary bg-background shadow-sm font-medium" : "border-transparent bg-transparent text-muted-foreground",
            )}
          >
            <div className="truncate font-medium">{chapter.title}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Chapter {chapter.order + 1}</div>
          </button>
        ))}
      </nav>
    </aside>
  );
}
