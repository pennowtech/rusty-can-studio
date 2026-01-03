import { useHelpStore } from "@/components/help-system/store/helpStore";
import { Input } from "../ui/input";
import { forwardRef } from "react";

export const HelpSearchInput = forwardRef<HTMLInputElement>(function HelpSearchInput(_, ref) {
  const { searchQuery, setSearchQuery, moveActive, searchResults, activeIndex, clearSearch } = useHelpStore();

  return (
    <div className="relative w-64">
      <Input
        ref={ref}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
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
            });
          }

          if (e.key === "Escape") {
            clearSearch();
          }
        }}
        placeholder="Search help content…"
        className="pl-8 h-8"
      />
      {searchResults.length > 0 && (
        <span className="text-xs text-muted-foreground">
          {activeIndex + 1}/{searchResults.length}
        </span>
      )}
    </div>
  );
});
