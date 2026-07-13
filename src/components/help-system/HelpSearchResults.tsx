import { useHelpStore } from "@/components/help-system/store/helpStore";
import { useHelpContentStore } from "./store/helpContentStore";

export function HelpSearchResults() {
  const searchQuery = useHelpStore((s) => s.searchQuery);
  const results = useHelpStore((s) => s.searchResults);
  const activeIndex = useHelpStore((s) => s.activeIndex);
  const setActiveIndex = useHelpStore((s) => s.setActiveIndex);
  const chapters = useHelpContentStore((s) => s.chapters);
  const selectChapter = useHelpContentStore((s) => s.selectChapter);
  const matchingChapters = searchQuery
    ? chapters
        .filter((chapter) => `${chapter.title} ${chapter.markdown}`.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 6)
    : [];

  if (!searchQuery) return null;

  if (results.length === 0) {
    if (!matchingChapters.length) {
      return <div className="border-t px-3 py-2 text-sm text-muted-foreground">No results</div>;
    }

    return (
      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2 text-sm text-muted-foreground">
        <span>Found in chapters:</span>
        {matchingChapters.map((chapter) => (
          <button key={chapter.id} type="button" className="rounded-md border px-2 py-1 hover:bg-muted hover:text-foreground" onClick={() => selectChapter(chapter.id)}>
            {chapter.title}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="border-t px-3 py-2 text-sm text-muted-foreground">
      <button type="button"
        className="hover:text-foreground"
        onClick={() => {
          setActiveIndex(activeIndex >= 0 ? activeIndex : 0);
          results[activeIndex >= 0 ? activeIndex : 0]?.scrollIntoView({ block: "center", behavior: "smooth" });
        }}
      >
        {results.length} result{results.length !== 1 ? "s" : ""}. Active {activeIndex + 1} of {results.length}.
      </button>
    </div>
  );
}

