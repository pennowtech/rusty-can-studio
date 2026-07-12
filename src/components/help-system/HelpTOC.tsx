// help/HelpTOC.tsx
import { useHelpTocStore } from "@/components/help-system/store/useHelpTocStore";
import clsx from "clsx";

export function HelpTOC() {
  const toc = useHelpTocStore((s) => s.toc);
  const scrollTo = useHelpTocStore((s) => s.scrollTo);
  const activeId = useHelpTocStore((s) => s.activeId);

  return (
    <div className="space-y-2 p-3 text-sm">
      <div className="text-xs font-medium uppercase text-muted-foreground">On this page</div>
      <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        {toc.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => scrollTo(item.id)}
            className={clsx(
              "shrink-0 cursor-pointer rounded-md px-2 py-1 text-left hover:bg-muted hover:text-foreground lg:block lg:w-full",
              activeId === item.id ? "bg-muted text-primary font-medium" : "text-muted-foreground",
              item.level === 1 && "font-medium",
              item.level === 2 && "lg:pl-4",
              item.level === 3 && "lg:pl-6",
            )}
          >
            {item.text}
          </button>
        ))}
      </nav>
    </div>
  );
}
