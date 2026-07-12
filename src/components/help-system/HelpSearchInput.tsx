import { useHelpStore } from "@/components/help-system/store/helpStore";
import { Input } from "../ui/input";
import { forwardRef } from "react";
import { Search } from "lucide-react";

export const HelpSearchInput = forwardRef<HTMLInputElement>(function HelpSearchInput(_, ref) {
  const { searchQuery, setSearchQuery, moveActive, searchResults, activeIndex, clearSearch } = useHelpStore();

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-80">
      <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
      <Input
        ref={ref}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            clearSearch();
            return;
          }

          if (!searchResults.length) return;

          if (e.key === "ArrowDown") {
            e.preventDefault();
            moveActive(1);
          }

          if (e.key === "ArrowUp") {
            e.preventDefault();
            moveActive(-1);
          }

          if (e.key === "Enter") {
            e.preventDefault();
            searchResults[activeIndex]?.scrollIntoView({
              block: "center",
              behavior: "smooth",
            });
          }
        }}
        placeholder="Search help content"
        className="h-8 pl-8 pr-14"
      />
      {searchResults.length > 0 && (
        <span className="absolute right-2 top-2 text-xs text-muted-foreground">
          {activeIndex + 1}/{searchResults.length}
        </span>
      )}
    </div>
  );
});
