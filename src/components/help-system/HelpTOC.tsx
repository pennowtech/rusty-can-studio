// help/HelpTOC.tsx
import { useHelpTocStore } from "@/components/help-system/store/useHelpTocStore";
import clsx from "clsx";

export function HelpTOC() {
  const toc = useHelpTocStore((s) => s.toc);
  const scrollTo = useHelpTocStore((s) => s.scrollTo);
  const activeId = useHelpTocStore((s) => s.activeId);

  return (
    <div className="space-y-3 p-4 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-primary/80 border-b pb-2">
        Table of Contents
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        {toc.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => scrollTo(item.id)}
            className={clsx(
              "shrink-0 cursor-pointer rounded-r-md px-2.5 py-1.5 text-left text-xs transition-all lg:block lg:w-full",
              activeId === item.id
                ? "bg-primary/10 text-primary font-semibold border-l-2 border-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              item.level === 1 && "font-semibold text-foreground border-l-2 border-primary/40",
              item.level === 2 && "lg:ml-3",
              item.level === 3 && "lg:ml-5 text-[11px] opacity-90",
            )}
          >
            {item.text}
          </button>
        ))}
      </nav>
    </div>
  );
}
