import clsx from "clsx";
import { useHelpStore } from "@/components/help-system/store/helpStore";

export function HelpSearchResults() {
  const results = useHelpStore((s) => s.searchResults);
  const activeIndex = useHelpStore((s) => s.activeIndex);
  const setActiveIndex = useHelpStore((s) => s.setActiveIndex);

  return (
    <div className="max-h-64 overflow-auto border-t bg-background">
      {results.length === 0 ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
      ) : (
        <div className="px-3 py-2 text-sm text-muted-foreground">
          {results.length} result{results.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
