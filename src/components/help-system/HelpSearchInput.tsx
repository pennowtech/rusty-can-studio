import { useHelpStore } from "@/components/help-system/store/helpStore";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { forwardRef } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";

export const HelpSearchInput = forwardRef<HTMLInputElement>(function HelpSearchInput(_, ref) {
  const { searchQuery, setSearchQuery, moveActive, searchResults, activeIndex, clearSearch } = useHelpStore();

  return (
    <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:max-w-md">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={ref}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              clearSearch();
              (e.target as HTMLElement).blur();
              return;
            }

            if (!searchResults.length) return;

            if (e.key === "Enter") {
              e.preventDefault();
              moveActive(e.shiftKey ? -1 : 1);
              (e.target as HTMLElement).blur();
              return;
            }

            if (e.key === "ArrowDown" || ((e.ctrlKey || e.altKey) && e.key.toLowerCase() === "n")) {
              e.preventDefault();
              moveActive(1);
              return;
            }

            if (e.key === "ArrowUp" || ((e.ctrlKey || e.altKey) && e.key.toLowerCase() === "p")) {
              e.preventDefault();
              moveActive(-1);
              return;
            }
          }}
          placeholder="Search help content... (Press Enter or n/p)"
          className="h-8 pl-8 pr-16 text-xs"
        />
        {searchResults.length > 0 && (
          <span className="absolute right-2 top-2 text-[11px] font-mono text-muted-foreground select-none">
            {activeIndex + 1}/{searchResults.length}
          </span>
        )}
      </div>

      {searchQuery.trim().length > 0 && (
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 cursor-pointer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => moveActive(-1)}
            disabled={!searchResults.length}
            title="Previous match (p)"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 cursor-pointer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => moveActive(1)}
            disabled={!searchResults.length}
            title="Next match (n)"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={clearSearch}
            title="Clear search (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
});
