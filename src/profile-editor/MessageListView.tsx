import { useRef, useState } from "react";
import { MessageEditor } from "@/profile-editor/MessageEditor";
import type { ProfileDocument } from "@/profile-editor/model/profile";
import { idBadgeFor, messageUsage, type VariantEntry } from "@/profile-editor/messageListHelpers";

const LIST_WIDTH_KEY = "cansim.profileEditor.messagesListWidth.v1";

function readListWidth(): number {
  const stored = Number(localStorage.getItem(LIST_WIDTH_KEY));
  return stored >= 180 && stored <= 420 ? stored : 240;
}

// Vertical message list on the left, the selected message's full editor
// (bit grid, fields, decoded preview — same as the grid view's drawer,
// just inline instead of an overlay) on the right. The list column is
// user-resizable; the editor itself keeps its natural fixed width and
// stays centered in whatever space is left, rather than stretching.
export function MessageListView({
  entries,
  activeProfile,
  selectedId,
  onSelect,
}: {
  entries: VariantEntry[];
  activeProfile: ProfileDocument;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [listWidth, setListWidth] = useState(() => readListWidth());
  const resizing = useRef(false);
  const latestWidth = useRef(listWidth);

  function startResize(event: React.MouseEvent) {
    event.preventDefault();
    resizing.current = true;
    const startX = event.clientX;
    const startWidth = listWidth;
    function onMove(moveEvent: MouseEvent) {
      if (!resizing.current) return;
      const next = Math.min(420, Math.max(180, startWidth + (moveEvent.clientX - startX)));
      latestWidth.current = next;
      setListWidth(next);
    }
    function onUp() {
      resizing.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      localStorage.setItem(LIST_WIDTH_KEY, String(latestWidth.current));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 shrink-0 flex-col gap-0.5 overflow-y-auto pr-1" style={{ width: listWidth }}>
        {entries.map(({ key, variant }) => {
          const usage = messageUsage(variant);
          const idBadge = idBadgeFor(key, activeProfile, variant.id);
          const selected = variant.id === selectedId;
          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => onSelect(variant.id)}
              title={variant.label || variant.id}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${selected ? "bg-muted" : "hover:bg-muted/50"}`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${usage.hasError ? "bg-destructive" : "bg-emerald-500"}`} />
              <span className="min-w-0 flex-1 truncate font-medium">{variant.label || variant.id}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{idBadge}</span>
            </button>
          );
        })}
        {entries.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No messages match your filter.</p>}
      </div>

      <div onMouseDown={startResize} className="group relative w-2.5 shrink-0 cursor-col-resize">
        <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-primary" />
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto pl-1">
        {selectedId ? (
          <MessageEditor messageId={selectedId} layout="inline" onClose={() => onSelect(null)} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select a message to view its structure.</div>
        )}
      </div>
    </div>
  );
}
