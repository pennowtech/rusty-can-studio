import { useHelpStore } from "@/components/help-system/store/helpStore";

export function HelpSearchResults() {
  const searchQuery = useHelpStore((s) => s.searchQuery);
  const results = useHelpStore((s) => s.searchResults);
  const activeIndex = useHelpStore((s) => s.activeIndex);
  const setActiveIndex = useHelpStore((s) => s.setActiveIndex);

  if (!searchQuery) return null;

  if (results.length === 0) {
    return <div className="border-t px-3 py-2 text-sm text-muted-foreground">No results</div>;
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

