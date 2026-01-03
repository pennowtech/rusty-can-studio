// help/HelpTOC.tsx
import { useHelpTocStore } from "@/components/help-system/store/useHelpTocStore";
import clsx from "clsx";

export function HelpTOC() {
  const toc = useHelpTocStore((s) => s.toc);
  const scrollTo = useHelpTocStore((s) => s.scrollTo);
  const activeId = useHelpTocStore((s) => s.activeId);

  return (
    <div className="p-3 text-sm space-y-1">
      {toc.map((item) => (
        <div
          key={item.id}
          onClick={() => scrollTo(item.id)}
          className={clsx(
            "cursor-pointer hover:text-foreground",
            activeId === item.id ? "text-primary font-medium" : "text-muted-foreground",
            item.level === 1 && "font-medium",
            item.level === 2 && "pl-2",
            item.level === 3 && "pl-4 text-muted-foreground",
          )}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}
