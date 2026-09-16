import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { CanonicalField } from "@/profile-editor/model/canonicalProfile";
import type { BitOverlapError } from "@/profile-editor/validation/validateBitLayout";

const TYPE_PILL_CLASSES: Record<string, string> = {
  uint: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  int: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  bool: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  enum: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  bytes: "bg-muted text-muted-foreground",
  string: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

// Shared field card — used by the message drawer, CAN ID layout tab, and
// payload common tab, so all three field-editing surfaces look and behave
// the same. Read state shows the field name plus a row of label-over-value
// meta columns (start/bits, type, factor, offset, unit, dictionary —
// whichever are actually set) and a pencil/trash action pair; the pencil
// swaps the card into an inline edit form. The grip handle drives
// drag-to-reorder within the field list (wired by the caller).
export function FieldCard({
  field,
  editable,
  selected,
  errors,
  dictionaries,
  onSelect,
  onChange,
  onDelete,
  onCreateDictionary,
  draggable,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: {
  field: CanonicalField;
  editable: boolean;
  selected: boolean;
  errors?: BitOverlapError[];
  dictionaries: string[];
  onSelect: () => void;
  onChange: (patch: Partial<CanonicalField>) => void;
  onDelete: () => void;
  onCreateDictionary: (name: string) => void;
  draggable?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
}) {
  const hasError = Boolean(errors?.length);
  const bitRangeText = field.bitLength === 1 ? `bit ${field.startBit}` : `bits ${field.startBit}–${field.startBit + field.bitLength - 1}`;
  function confirmDelete(event?: { stopPropagation: () => void }) {
    event?.stopPropagation();
    if (window.confirm(`Delete field "${field.name}"? This cannot be undone.`)) onDelete();
  }
  const otherParts: string[] = [];
  if (field.factor != null) otherParts.push(`×${field.factor}`);
  if (field.offset != null) otherParts.push(`+${field.offset}`);
  if (field.dictionary) otherParts.push(`dict:${field.dictionary}`);
  const otherText = otherParts.join(" · ");
  const typePillClass = TYPE_PILL_CLASSES[field.type ?? "uint"] ?? TYPE_PILL_CLASSES.uint;
  const editInputClass = "h-7 rounded border-0 border-b border-border/60 bg-muted/40 px-1.5 text-xs text-foreground shadow-none focus-visible:border-b-primary focus-visible:bg-muted/70 focus-visible:ring-0 focus-visible:ring-offset-0";
  const editSelectClass = "h-7 rounded border-0 border-b border-border/60 bg-muted/40 px-1.5 text-xs text-foreground shadow-none focus:border-b-primary focus:bg-muted/70 focus:ring-0 focus:ring-offset-0";
  const editLabelClass = "space-y-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

  return (
    <div
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDrop={(event) => {
        event.preventDefault();
        onDrop?.();
      }}
      onClick={() => {
        if (!selected) onSelect();
      }}
      className={`rounded-lg border bg-card p-3 transition-colors ${selected ? "border-primary ring-1 ring-primary" : hasError ? "cursor-pointer border-destructive" : "cursor-pointer border-border hover:border-primary/50"} ${isDragOver ? "border-t-2 border-t-primary" : ""} ${isDragging ? "opacity-40" : ""}`}
    >
      {selected ? (
        <div onClick={(event) => event.stopPropagation()}>
          <div className="grid gap-x-3 gap-y-2.5" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
            <label className={editLabelClass}>
              Name
              <Input className={editInputClass} value={field.name} disabled={!editable} onChange={(event) => onChange({ name: event.target.value })} />
            </label>
            <label className={editLabelClass}>
              Start
              <Input className={editInputClass} type="number" value={field.startBit} disabled={!editable} onChange={(event) => onChange({ startBit: Number(event.target.value) })} />
            </label>
            <label className={editLabelClass}>
              Bits
              <Input className={editInputClass} type="number" value={field.bitLength} disabled={!editable} onChange={(event) => onChange({ bitLength: Number(event.target.value) })} />
            </label>
            <label className={editLabelClass}>
              Type
              <Select value={field.type ?? "uint"} disabled={!editable} onValueChange={(value) => onChange({ type: value as CanonicalField["type"] })}>
                <SelectTrigger className={editSelectClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="uint">uint</SelectItem>
                  <SelectItem value="int">int</SelectItem>
                  <SelectItem value="bool">bool</SelectItem>
                  <SelectItem value="enum">enum</SelectItem>
                  <SelectItem value="bytes">bytes</SelectItem>
                  <SelectItem value="string">string</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className={editLabelClass}>
              Dictionary
              <Select
                value={field.dictionary ?? "__none__"}
                disabled={!editable}
                onValueChange={(val) => {
                  if (val === "__none__") onChange({ dictionary: undefined });
                  else if (val === "__create_new__") {
                    const name = window.prompt("Enter new dictionary name:");
                    if (name) {
                      const cleanName = name.trim().replace(/[^a-zA-Z0-9_]/g, "_");
                      if (cleanName) {
                        onCreateDictionary(cleanName);
                        onChange({ dictionary: cleanName });
                      }
                    }
                  } else onChange({ dictionary: val });
                }}
              >
                <SelectTrigger className={editSelectClass}><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {dictionaries.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                  <SelectItem value="__create_new__" className="font-medium text-primary">+ Create New...</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className={editLabelClass}>
              Factor
              <Input className={editInputClass} type="number" value={field.factor ?? ""} disabled={!editable} onChange={(event) => onChange({ factor: event.target.value === "" ? undefined : Number(event.target.value) })} />
            </label>
            <label className={editLabelClass}>
              Unit
              <Input className={editInputClass} value={field.unit ?? ""} disabled={!editable} onChange={(event) => onChange({ unit: event.target.value || undefined })} />
            </label>
            <label className={editLabelClass}>
              Offset
              <Input className={editInputClass} type="number" value={field.offset ?? ""} disabled={!editable} onChange={(event) => onChange({ offset: event.target.value === "" ? undefined : Number(event.target.value) })} />
            </label>
          </div>

          <label className={`mt-2.5 block ${editLabelClass}`}>
            Expression
            <Input className={`${editInputClass} font-mono`} value={field.display?.expression ?? ""} disabled={!editable} placeholder="raw * 0.1" onChange={(event) => onChange({ display: event.target.value ? { expression: event.target.value } : undefined })} />
          </label>
          <div className="mt-2.5 flex items-center justify-between">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive hover:text-destructive-foreground" disabled={!editable} title="Delete field" onClick={confirmDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="secondary" size="icon" className="h-7 w-7" title="Done" onClick={onSelect}>
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {draggable && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" />}
          <span className="shrink-0 truncate text-sm font-semibold" style={{ maxWidth: "35%" }} title={field.name}>
            {field.name}
          </span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${typePillClass}`}>{field.type ?? "uint"}</span>
          {field.unit && <span className="shrink-0 text-[11px] text-muted-foreground">{field.unit}</span>}
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={otherText || undefined}>
            {otherText}
          </span>
          <span className="shrink-0 font-mono text-[11px] font-medium text-muted-foreground">{bitRangeText}</span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={!editable}
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!editable}
              onClick={confirmDelete}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      {hasError && errors && (
        <div className="mt-2 text-[11px] font-medium text-destructive">
          ⚠ Overlaps {errors.map((e) => (e.fieldA === field.name ? e.fieldB : e.fieldA)).join(", ")} at bits {errors[0].overlapRange[0]}–{errors[0].overlapRange[1]}
        </div>
      )}
    </div>
  );
}
