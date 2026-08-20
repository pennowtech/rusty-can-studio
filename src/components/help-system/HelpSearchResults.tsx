import { useHelpStore } from "@/components/help-system/store/helpStore";
import { useHelpContentStore } from "./store/helpContentStore";

export function HelpSearchResults() {
  const searchQuery = useHelpStore((s) => s.searchQuery);
  const results = useHelpStore((s) => s.searchResults);
  const activeIndex = useHelpStore((s) => s.activeIndex);
  const chapters = useHelpContentStore((s) => s.chapters);
  const selectChapter = useHelpContentStore((s) => s.selectChapter);
  const matchingChapters = searchQuery
    ? chapters
        .filter((chapter) => `${chapter.title} ${chapter.markdown}`.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 6)
    : [];

  const selectedChapterId = useHelpContentStore((s) => s.selectedChapterId);

  if (!searchQuery) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-xs text-muted-foreground bg-muted/20">
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">
          {results.length > 0 ? `${results.length} match${results.length !== 1 ? "es" : ""} in current chapter (Active ${activeIndex + 1}/${results.length})` : "No matches in current chapter"}
        </span>
      </div>

      {matchingChapters.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          <span className="text-[11px] text-muted-foreground">Chapters:</span>
          {matchingChapters.map((chapter) => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => selectChapter(chapter.id)}
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition-all ${
                chapter.id === selectedChapterId
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted border hover:bg-muted/80 text-foreground"
              }`}
            >
              {chapter.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

