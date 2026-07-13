import { Input } from "@/components/ui/input";
import { useHelpContentStore } from "@/components/help-system/store/helpContentStore";
import { BookOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";
import clsx from "clsx";

export function HelpChapterList() {
  const chapters = useHelpContentStore((s) => s.chapters);
  const selectedChapterId = useHelpContentStore((s) => s.selectedChapterId);
  const selectChapter = useHelpContentStore((s) => s.selectChapter);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const visibleChapters = useMemo(
    () =>
      chapters.filter((chapter) => {
        if (!normalizedQuery) return true;
        return `${chapter.title} ${chapter.markdown}`.toLowerCase().includes(normalizedQuery);
      }),
    [chapters, normalizedQuery],
  );

  return (
    <aside className="flex min-h-0 w-full flex-col border-b bg-muted/20 lg:w-72 lg:border-b-0 lg:border-r">
      <div className="border-b p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-primary" />
          Help library
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="h-8 pl-8 text-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find chapter" />
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto p-3 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto">
        {visibleChapters.map((chapter) => (
          <button type="button"
            key={chapter.id}
            onClick={() => selectChapter(chapter.id)}
            className={clsx(
              "min-w-48 rounded-md border px-3 py-2 text-left text-sm transition hover:bg-background lg:min-w-0",
              selectedChapterId === chapter.id ? "border-primary bg-background shadow-sm" : "border-transparent bg-transparent text-muted-foreground",
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
