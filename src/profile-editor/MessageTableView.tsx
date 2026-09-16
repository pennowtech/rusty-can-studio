import { useState } from "react";
import type { ProfileDocument } from "@/profile-editor/model/profile";
import { idBadgeFor, messageUsage, type VariantEntry } from "@/profile-editor/messageListHelpers";

type SortKey = "id" | "name" | "bytes" | "fields" | "status";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "id", label: "CAN ID" },
  { key: "name", label: "Name" },
  { key: "bytes", label: "Bytes" },
  { key: "fields", label: "Fields" },
  { key: "status", label: "Status" },
];

// Dense sortable data-grid alternative to the card grid — click a header
// to sort, click a row to open its editor as a popup (same drawer the
// grid view uses).
export function MessageTableView({
  entries,
  activeProfile,
  onOpenMessage,
  selectedId,
}: {
  entries: VariantEntry[];
  activeProfile: ProfileDocument;
  onOpenMessage: (messageId: string) => void;
  selectedId?: string | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("id");

  const rows = entries
    .map(({ key, variant }) => ({ variant, usage: messageUsage(variant), idBadge: idBadgeFor(key, activeProfile, variant.id) }))
    .sort((a, b) => {
      switch (sortKey) {
        case "bytes":
          return b.usage.totalBytes - a.usage.totalBytes;
        case "fields":
          return b.variant.payload.fields.length - a.variant.payload.fields.length;
        case "status":
          return Number(b.usage.hasError) - Number(a.usage.hasError);
        case "name":
          return (a.variant.label || a.variant.id).localeCompare(b.variant.label || b.variant.id);
        default:
          return a.idBadge.localeCompare(b.idBadge);
      }
    });

  return (
    <div className="h-full min-h-0 overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => setSortKey(col.key)}
                className={`cursor-pointer select-none border-b px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide ${sortKey === col.key ? "text-foreground" : "text-muted-foreground"}`}
              >
                {col.label} {sortKey === col.key && <span className="opacity-60">▾</span>}
              </th>
            ))}
            <th className="border-b px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Usage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ variant, usage, idBadge }) => (
            <tr
              key={variant.id}
              onClick={() => onOpenMessage(variant.id)}
              className={`cursor-pointer border-b transition-colors hover:bg-muted/20 ${variant.id === selectedId ? "border-l-2 border-l-primary bg-primary/5" : ""}`}
            >
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{idBadge}</td>
              <td className="px-3 py-2 font-medium">{variant.label || variant.id}</td>
              <td className="px-3 py-2 text-muted-foreground">{usage.totalBytes}</td>
              <td className="px-3 py-2 text-muted-foreground">{variant.payload.fields.length}</td>
              <td className="px-3 py-2">
                {usage.hasError ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10.5px] font-semibold text-destructive">⚠ overlap</span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400">✓ ok</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex h-2 w-24 gap-0.5">
                  {usage.segments.map((segment, index) => (
                    <div key={index} className={`flex-1 rounded-sm ${segment.error ? "bg-destructive" : segment.used ? "bg-primary/60" : "bg-muted"}`} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No messages match your filter.</p>}
    </div>
  );
}
