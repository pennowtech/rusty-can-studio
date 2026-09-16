import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Plus, LayoutGrid, List, Table2 } from "lucide-react";
import { resolveProfileReferences, useProfileStore } from "@/profile-editor/store/profileStore";
import { createVariant, matchesSearch } from "@/profile-editor/profileFieldHelpers";
import { idBadgeFor, listVariants, messageUsage } from "@/profile-editor/messageListHelpers";
import { MessageListView } from "@/profile-editor/MessageListView";
import { MessageTableView } from "@/profile-editor/MessageTableView";

type ViewMode = "grid" | "list" | "table";
const VIEW_MODE_KEY = "cansim.profileEditor.messagesView.v1";

function readViewMode(): ViewMode {
  const stored = localStorage.getItem(VIEW_MODE_KEY);
  return stored === "list" || stored === "grid" ? stored : "table";
}

export function MessageGallery({ onOpenMessage, openMessageId }: { onOpenMessage: (messageId: string) => void; openMessageId?: string | null }) {
  const rawProfile = useProfileStore((s) => s.profile);
  const rawDraftProfile = useProfileStore((s) => s.draftProfile);
  const updateDraftProfile = useProfileStore((s) => s.updateDraftProfile);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() => readViewMode());
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const profile = useMemo(() => resolveProfileReferences(rawProfile), [rawProfile]);
  const draftProfile = useMemo(() => resolveProfileReferences(rawDraftProfile), [rawDraftProfile]);
  const activeProfile = draftProfile ?? profile;
  const editable = Boolean(draftProfile);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      activeProfile
        ? listVariants(activeProfile).filter(({ key, variant }) => matchesSearch(normalizedSearch, variant.id, variant.label, variant.description, key))
        : [],
    [activeProfile, normalizedSearch],
  );

  // The list view always needs something selected to show in its detail
  // pane — default to the first visible message the first time there is
  // one, or when the previously selected message disappears (deleted, or
  // filtered out by search).
  useEffect(() => {
    if (viewMode !== "list") return;
    if (selectedMessageId && filtered.some(({ variant }) => variant.id === selectedMessageId)) return;
    setSelectedMessageId(filtered[0]?.variant.id ?? null);
  }, [viewMode, filtered, selectedMessageId]);

  function changeViewMode(next: ViewMode) {
    setViewMode(next);
    localStorage.setItem(VIEW_MODE_KEY, next);
  }

  if (!activeProfile) return null;

  function addMessage() {
    let newId = "";
    updateDraftProfile((draft) => {
      const variant = createVariant(listVariants(draft).length);
      draft.payload.variants[variant.id] = variant;
      newId = variant.id;
    });
    if (viewMode === "list") setSelectedMessageId(newId);
    else onOpenMessage(newId);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter messages" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={!editable}
            onClick={addMessage}
            className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            New message
          </button>
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <button type="button" title="Grid view" onClick={() => changeViewMode("grid")} className={`flex h-8 w-8 items-center justify-center rounded ${viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" title="List view" onClick={() => changeViewMode("list")} className={`flex h-8 w-8 items-center justify-center rounded ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
              <List className="h-4 w-4" />
            </button>
            <button type="button" title="Table view" onClick={() => changeViewMode("table")} className={`flex h-8 w-8 items-center justify-center rounded ${viewMode === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
              <Table2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {viewMode === "list" && <MessageListView entries={filtered} activeProfile={activeProfile} selectedId={selectedMessageId} onSelect={setSelectedMessageId} />}
        {viewMode === "table" && (
          <div className="h-full overflow-auto">
            <MessageTableView entries={filtered} activeProfile={activeProfile} onOpenMessage={onOpenMessage} selectedId={openMessageId ?? null} />
          </div>
        )}
        {viewMode === "grid" && (
          <div className="h-full overflow-auto">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 pb-4">
              {filtered.map(({ key, variant }) => {
                const usage = messageUsage(variant);
                const idBadge = idBadgeFor(key, activeProfile, variant.id);
                const selected = variant.id === openMessageId;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => onOpenMessage(variant.id)}
                    title={variant.label || variant.id}
                    className={`min-w-0 rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary ${selected ? "border-primary ring-1 ring-primary" : ""}`}
                  >
                    <div className="mb-2.5 flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-muted-foreground" title={idBadge}>
                        {idBadge}
                      </span>
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${usage.hasError ? "bg-destructive" : "bg-emerald-500"}`} />
                    </div>
                    <h3 className="truncate text-[14.5px] font-semibold">{variant.label || variant.id}</h3>
                    <div className="mb-3 text-[11px] text-muted-foreground">
                      {usage.totalBytes} bytes · {variant.payload.fields.length} fields
                    </div>
                    <div className="flex h-2.5 gap-0.5">
                      {usage.segments.map((segment, index) => (
                        <div key={index} className={`flex-1 rounded-sm ${segment.error ? "bg-destructive" : segment.used ? "bg-primary/60" : "bg-muted"}`} />
                      ))}
                    </div>
                    {usage.hasError && <div className="mt-1.5 text-[10px] font-medium text-destructive">overlap</div>}
                  </button>
                );
              })}
            </div>
            {filtered.length === 0 && normalizedSearch && <p className="px-1 text-sm text-muted-foreground">No messages match "{search}".</p>}
          </div>
        )}
      </div>
    </div>
  );
}
