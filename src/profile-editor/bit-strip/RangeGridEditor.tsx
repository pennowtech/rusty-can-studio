import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { RangeItem } from "./rangeTypes";
import { computeOverlappingBits } from "./rangeOverlap";
import { Badge } from "@/components/ui/badge";

type DragMode = "move" | "resize-left" | "resize-right";

export type RangeGridEditorProps = {
  length: number;
  items: RangeItem[];
  editable?: boolean;

  unitLabel?: (index: number) => string;
  onChange: (id: string, start: number, length: number) => void;
};

export function RangeGridEditor({
  length,
  items,
  editable = false,
  unitLabel = (i) => i.toString(),
  onChange,
}: RangeGridEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlappingUnits = computeOverlappingBits(items);

  const [bitsPerRow, setBitsPerRow] = useState(32);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    function update() {
      if (!containerRef.current) return;
      const w = containerRef.current.offsetWidth;
      setBitsPerRow(w < 490 ? 8 : w < 1020 ? 16 : 32);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  function itemAt(index: number) {
    return items.find((r) => index >= r.start && index < r.start + r.length);
  }

  function startDrag(index: number, item: RangeItem, e: React.MouseEvent) {
    if (!editable) return;

    let mode: DragMode = "move";
    if (index === item.start) mode = "resize-left";
    else if (index === item.start + item.length - 1) mode = "resize-right";

    setActiveId(item.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = item.start;
    const origLength = item.length;

    function onMove(ev: MouseEvent) {
      if (!containerRef.current) return;

      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      const unitSize = containerRef.current.offsetWidth / bitsPerRow;

      const deltaCol = Math.round(dx / unitSize);
      const deltaRow = Math.round(dy / (unitSize + 8));
      const delta = deltaRow * bitsPerRow + deltaCol;

      if (mode === "move") {
        onChange(item.id, Math.max(0, Math.min(length - origLength, origStart + delta)), origLength);
      }

      if (mode === "resize-left") {
        const newStart = Math.max(0, origStart + delta);
        const newLen = origLength + (origStart - newStart);
        if (newLen > 0) onChange(item.id, newStart, newLen);
      }

      if (mode === "resize-right") {
        const newLen = Math.max(1, Math.min(length - origStart, origLength + delta));
        onChange(item.id, origStart, newLen);
      }
    }

    function onUp() {
      setActiveId(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Labels */}
      <div className="flex flex-wrap gap-2 text-xs">
        {items.map((i) => (
          <Badge
            key={i.id}
            variant="secondary"
            className={cn(
              "px-2 py-0.5 rounded border",
              activeId === i.id && "bg-green-500/20 border-green-500",
              hoverId === i.id && "bg-yellow-500/20 border-yellow-500",
              !activeId && !hoverId && "bg-muted border-muted",
            )}
          >
            {i.label} [{i.start}–{i.start + i.length - 1}]
          </Badge>
        ))}
      </div>

      {/* Grid */}
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${bitsPerRow}, minmax(28px, 1fr))`,
        }}
      >
        {Array.from({ length }).map((_, index) => {
          const item = itemAt(index);
          const isOverlap = overlappingUnits.has(index);
          const isHover = item && item.id === hoverId;
          const isActive = item && item.id === activeId;

          return (
            <div
              key={index}
              className={cn(
                "h-8 rounded-md border flex items-center justify-center text-[10px] font-mono select-none",
                item ? "bg-blue-500/20 border-blue-500" : "bg-background border-muted",
                isHover && "bg-yellow-500/30 border-yellow-500",
                isActive && "bg-green-500/30 border-green-500",
                isOverlap && "bg-red-500/40 border-red-600",
              )}
              title={item ? `${item.label} (${unitLabel(index)})` : unitLabel(index)}
              onMouseEnter={() => item && setHoverId(item.id)}
              onMouseLeave={() => setHoverId(null)}
              onMouseDown={(e) => item && startDrag(index, item, e)}
            >
              {unitLabel(index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
