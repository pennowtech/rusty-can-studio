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
  activeItemId?: string | null;
  hoverItemId?: string | null;

  unitLabel?: (index: number) => string;
  valueLabel?: (index: number) => string | number;
  onHoverItem?: (id: string | null) => void;
  onChange: (id: string, start: number, length: number) => void;
};

export function RangeGridEditor({
  length,
  items,
  editable = false,
  activeItemId,
  hoverItemId,
  unitLabel = (i) => i.toString(),
  valueLabel,
  onHoverItem,
  onChange,
}: RangeGridEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlappingUnits = computeOverlappingBits(items);

  const [bitsPerRow, setBitsPerRow] = useState(32);
  const [internalHoverId, setInternalHoverId] = useState<string | null>(null);
  const [internalActiveId, setInternalActiveId] = useState<string | null>(null);
  const hoverId = hoverItemId ?? internalHoverId;
  const activeId = activeItemId ?? internalActiveId;

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

  function displayToBitIndex(displayIndex: number) {
    const totalBytes = Math.ceil(length / 8);
    const displayByte = Math.floor(displayIndex / 8);
    const byteIndex = totalBytes - displayByte - 1;
    return byteIndex * 8 + (7 - (displayIndex % 8));
  }

  function startDrag(index: number, item: RangeItem, e: React.MouseEvent) {
    if (!editable) return;

    let mode: DragMode = "move";
    if (index === item.start) mode = "resize-left";
    else if (index === item.start + item.length - 1) mode = "resize-right";

    setInternalActiveId(item.id);

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
      setInternalActiveId(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div ref={containerRef} className="space-y-1.5">
      {/* Labels */}
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {items.map((i) => (
          <Badge
            key={i.id}
            variant="secondary"
            onMouseEnter={() => {
              setInternalHoverId(i.id);
              onHoverItem?.(i.id);
            }}
            onMouseLeave={() => {
              setInternalHoverId(null);
              onHoverItem?.(null);
            }}
            className={cn(
              "rounded border px-1.5 py-0 text-[10px]",
              activeId === i.id && "bg-green-500/20 border-green-500",
              hoverId === i.id && "bg-yellow-500/20 border-yellow-500",
              !activeId && !hoverId && "bg-muted border-muted",
            )}
          >
            {i.label} [{i.start}-{i.start + i.length - 1}]
          </Badge>
        ))}
      </div>

      {Array.from({ length: Math.ceil(length / bitsPerRow) }).map((_, rowIndex) => {
        const rowDisplayStart = rowIndex * bitsPerRow;
        const rowLength = Math.min(bitsPerRow, length - rowDisplayStart);

        return (
          <div key={rowDisplayStart} className="space-y-0.5">
            <div
              className="grid gap-0.5"
              style={{
                gridTemplateColumns: `repeat(${bitsPerRow}, minmax(18px, 1fr))`,
              }}
            >
              {Array.from({ length: rowLength }).map((__, offset) => {
                const displayIndex = rowDisplayStart + offset;
                const bitIndex = displayToBitIndex(displayIndex);
                const item = itemAt(bitIndex);
                const isOverlap = overlappingUnits.has(bitIndex);
                const isHover = item && item.id === hoverId;
                const isActive = item && item.id === activeId;

                return (
                  <div
                    key={bitIndex}
                    className={cn(
                      "flex h-6 select-none items-center justify-center rounded border font-mono text-[11px] font-semibold",
                      item ? "border-blue-500 bg-blue-500/20" : "border-muted bg-background",
                      isHover && "border-yellow-500 bg-yellow-500/30",
                      isActive && "border-green-500 bg-green-500/30",
                      isOverlap && "border-red-600 bg-red-500/40",
                    )}
                    title={item ? `${item.label} (${unitLabel(bitIndex)})` : unitLabel(bitIndex)}
                    onMouseEnter={() => {
                      if (!item) return;
                      setInternalHoverId(item.id);
                      onHoverItem?.(item.id);
                    }}
                    onMouseLeave={() => {
                      setInternalHoverId(null);
                      onHoverItem?.(null);
                    }}
                    onMouseDown={(e) => item && startDrag(bitIndex, item, e)}
                  >
                    {valueLabel ? valueLabel(bitIndex) : 0}
                  </div>
                );
              })}
            </div>
            <div
              className="grid gap-0.5"
              style={{
                gridTemplateColumns: `repeat(${bitsPerRow}, minmax(18px, 1fr))`,
              }}
            >
              {Array.from({ length: rowLength }).map((__, offset) => {
                const displayIndex = rowDisplayStart + offset;
                const bitIndex = displayToBitIndex(displayIndex);
                return (
                  <div key={bitIndex} className="truncate text-center font-mono text-[9px] leading-3 text-muted-foreground" title={unitLabel(bitIndex)}>
                    {unitLabel(bitIndex)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

