import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DecodedField, DecodedFrame } from "@/profile-editor/decodeProfile";
import { List, PanelBottomOpen, PanelRightOpen, Table2, X } from "lucide-react";
import { PinButton } from "@sbt/desktop-kit/components/PinButton";

// Column id for a decoded field's pinned-column entry - matches
// CanFdDashboard's own TraceColumn.id convention (profileCanIdColumns/
// profilePayloadColumns), built from DecodedField.source rather than a
// caller-supplied group label so it's derived the same way in both places.
function fieldColumnId(field: DecodedField) {
  return `${field.source}:${field.name}`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(3);
}

function formatDisplay(field: DecodedField) {
  return field.meaning ? `${field.displayValue} (${formatNumber(field.physical)})` : field.displayValue;
}

function bitRange(field: DecodedField) {
  const endBit = field.startBit + field.length - 1;
  return field.length === 1 ? `${field.startBit}` : `${field.startBit}-${endBit}`;
}

function fieldKey(field: DecodedField) {
  return `${field.source}-${field.name}-${field.startBit}`;
}

function formatCanIdHex(id: number) {
  return `0x${id.toString(16).toUpperCase().padStart(id > 0x7ff ? 8 : 3, "0")}`;
}

function formatPayloadHex(dataHex: string) {
  const cleaned = dataHex.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return cleaned ? `0x${cleaned}` : "";
}

type Density = "compact" | "full";
type DetailMode = "accordion" | "drawer";

// Compact by default (name -> value+unit, far right). Clicking a row shows
// the rest of it - Bits/Raw/Source/Meaning - either inline (an accordion
// strip right under the row) or in the side drawer, whichever this group's
// mode toggle is set to; there's no longer a separate per-row button for
// it, so the value stays flush against the group's own right edge. The
// Compact/Full switch is the escape hatch back to the original always-on
// Field/Bits/Raw/Value/Meaning table, per group, for anyone who preferred it.
function FieldGroup({
  title,
  headerValue,
  fields,
  expandedKey,
  onToggleExpanded,
  onOpenField,
  pinnedFields,
  onTogglePin,
  pinnableIds,
}: {
  title: string;
  headerValue?: string;
  fields: DecodedField[];
  expandedKey: string | null;
  onToggleExpanded: (key: string) => void;
  onOpenField?: (field: DecodedField) => void;
  pinnedFields?: Set<string>;
  onTogglePin?: (id: string) => void;
  /** Which of `fields` can actually become a trace-table column - CAN ID
   *  fields and payload.common fields decode on every frame this profile
   *  matches, but a matched variant's own payload fields don't (a
   *  different message on the same CAN ID decodes a different variant, so
   *  most rows would show nothing in that column). Omitted rows get no pin
   *  button rather than one that would silently do nothing (see
   *  CanFdDashboard's pruneToKnownFields, which only tracks canId/
   *  payload.common field ids). */
  pinnableIds?: Set<string>;
}) {
  const [drawerField, setDrawerField] = useState<DecodedField | null>(null);
  const [density, setDensity] = useState<Density>("compact");
  const [detailMode, setDetailMode] = useState<DetailMode>("accordion");

  function handleRowActivate(field: DecodedField, key: string) {
    if (detailMode === "drawer") setDrawerField(field);
    else onToggleExpanded(key);
  }

  return (
    <section className="relative overflow-hidden rounded-md border bg-background">
      <div className="flex items-center justify-between gap-2">
        <h3 className="decoded-preview-small shrink-0 px-2.5 py-1.5 font-semibold uppercase text-muted-foreground">{title}</h3>
        {headerValue && (
          <span className="decoded-preview-small min-w-0 flex-1 truncate text-right font-mono text-muted-foreground" title={headerValue}>
            {headerValue}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => setDensity(density === "compact" ? "full" : "compact")}
            >
              {density === "compact" ? <List className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
              <span className="sr-only">Switch to {density === "compact" ? "full table" : "compact rows"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Switch to {density === "compact" ? "full table" : "compact rows"}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={density === "full"}
              className="mr-2 h-6 w-6 shrink-0 disabled:pointer-events-none disabled:opacity-30"
              onClick={() => setDetailMode(detailMode === "accordion" ? "drawer" : "accordion")}
            >
              {detailMode === "accordion" ? <PanelBottomOpen className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
              <span className="sr-only">Switch to {detailMode === "accordion" ? "drawer" : "inline accordion"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{density === "full" ? "Only applies in compact rows" : `Switch to ${detailMode === "accordion" ? "drawer" : "inline accordion"}`}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      {fields.length ? (
        density === "full" ? (
          <div className="overflow-auto border-t">
            <table className="w-full table-auto">
              <thead className="decoded-preview-small bg-muted/50 uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Field</th>
                  <th className="px-2 py-1 text-left font-medium">Bits</th>
                  <th className="px-2 py-1 text-right font-medium">Raw</th>
                  <th className="px-2 py-1 text-right font-medium">Value</th>
                  <th className="px-2 py-1 text-left font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={fieldKey(field)} className="border-t last:border-b-0 hover:bg-muted/30" onDoubleClick={() => onOpenField?.(field)}>
                    <td className="max-w-32 truncate font-medium" title={field.name}>
                      {field.name}
                    </td>
                    <td className="decoded-preview-small whitespace-nowrap font-mono text-muted-foreground">{bitRange(field)}</td>
                    <td className="text-right font-mono">{field.raw}</td>
                    <td className="text-right font-mono">
                      {formatDisplay(field)}
                      {field.unit ? ` ${field.unit}` : ""}
                    </td>
                    <td className="max-w-36 truncate text-muted-foreground" title={field.meaning}>
                      {field.meaning ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border-t">
            {fields.map((field) => {
              const key = fieldKey(field);
              const expanded = expandedKey === key;
              const columnId = fieldColumnId(field);
              return (
                <div key={key} className="group/row relative border-t first:border-t-0">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={detailMode === "accordion" ? expanded : undefined}
                    className="decoded-row flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 hover:bg-muted/40"
                    onClick={() => handleRowActivate(field, key)}
                    onDoubleClick={() => onOpenField?.(field)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleRowActivate(field, key);
                      }
                    }}
                  >
                    {onTogglePin && pinnableIds?.has(columnId) && (
                      <PinButton field={columnId} pinned={pinnedFields?.has(columnId) ?? false} onTogglePin={onTogglePin} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-medium" title={field.name}>
                      {field.name}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono text-[11px]">
                      {formatDisplay(field)}
                      {field.unit && <span className="ml-1 text-muted-foreground">{field.unit}</span>}
                    </span>
                  </div>
                  {detailMode === "accordion" && expanded && (
                    <div className="decoded-row-detail decoded-preview-small grid grid-cols-2 gap-x-3 gap-y-1.5 bg-muted/30 px-2.5 py-2 sm:grid-cols-4">
                      <div>
                        <div className="text-muted-foreground">Bits</div>
                        <div className="font-mono">{bitRange(field)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Raw</div>
                        <div className="font-mono">{field.raw}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Source</div>
                        <div className="font-mono">{field.source}</div>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <div className="text-muted-foreground">Meaning</div>
                        <div className="truncate" title={field.meaning}>
                          {field.meaning ?? "—"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="decoded-preview-small border-t px-2.5 py-2 text-muted-foreground">No {title.toLowerCase()} defined.</div>
      )}
      <FieldDetailDrawer field={drawerField} onClose={() => setDrawerField(null)} />
    </section>
  );
}

function FieldDetailDrawer({ field, onClose }: { field: DecodedField | null; onClose: () => void }) {
  return (
    <>
      <div
        className={cn(
          "absolute inset-0 z-10 bg-black/30 opacity-0 transition-opacity pointer-events-none",
          field && "opacity-100 pointer-events-auto",
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute inset-y-0 right-0 z-20 flex w-[min(80%,20rem)] min-h-0 translate-x-full flex-col border-l bg-card shadow-lg transition-transform",
          field && "translate-x-0",
        )}
      >
        {field && (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b p-2.5">
              <span className="truncate text-sm font-semibold" title={field.name}>
                {field.name}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
                    <X className="h-3.5 w-3.5" />
                    <span className="sr-only">Close</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Close</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
              <div className="font-mono text-sm font-semibold">
                {formatDisplay(field)}
                {field.unit && <span className="ml-1.5 font-normal text-muted-foreground">{field.unit}</span>}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Bits</dt>
                <dd className="font-mono">{bitRange(field)}</dd>
                <dt className="text-muted-foreground">Raw</dt>
                <dd className="font-mono">{field.raw}</dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd className="font-mono">{field.source}</dd>
                <dt className="text-muted-foreground">Meaning</dt>
                <dd>{field.meaning ?? "—"}</dd>
              </dl>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function DecodedPreviewPanel({
  decoded,
  emptyText,
  onOpenMessage,
  onOpenField,
  pinnedFields,
  onTogglePin,
}: {
  decoded: DecodedFrame | null;
  emptyText?: string;
  onOpenMessage?: (decoded: DecodedFrame) => void;
  onOpenField?: (field: DecodedField, decoded: DecodedFrame) => void;
  /** Field column ids currently pinned (see CanFdDashboard's
   *  useFieldColumnsStore) - "canId:<name>" / "payload:<name>", matching
   *  fieldColumnId. Omit both this and onTogglePin to render with no pin
   *  UI at all (e.g. the profile editor's own decode-test preview, which
   *  has no trace table to pin a column onto). */
  pinnedFields?: Set<string>;
  onTogglePin?: (id: string) => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  function toggleExpanded(key: string) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  if (!decoded) {
    return <div className="text-sm text-muted-foreground">{emptyText ?? "No frame selected for decode."}</div>;
  }

  const pinnableIds = new Set([...decoded.canIdFields, ...decoded.payloadCommonFields].map(fieldColumnId));

  return (
    <div className="decoded-preview-panel space-y-2.5">
      {!decoded.requiresSchema && (
        <div className="rounded-md border bg-background">
          <div
            className="cursor-pointer border-l-4 border-primary px-2.5 py-2"
            title={`${decoded.meaning}\n${decoded.serviceName ?? decoded.frameName ?? "Unknown message"}`}
            onDoubleClick={() => onOpenMessage?.(decoded)}
          >
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{decoded.meaning}</div>
              <div className="decoded-preview-small mt-0.5 truncate text-muted-foreground">
                {decoded.serviceName ?? decoded.frameName ?? "Unknown message"}
              </div>
            </div>
          </div>
        </div>
      )}

      <FieldGroup
        title="CAN ID fields"
        headerValue={formatCanIdHex(decoded.rawCanId)}
        fields={decoded.canIdFields}
        expandedKey={expandedKey}
        onToggleExpanded={toggleExpanded}
        onOpenField={(field) => onOpenField?.(field, decoded)}
        pinnedFields={pinnedFields}
        onTogglePin={onTogglePin}
        pinnableIds={pinnableIds}
      />
      <FieldGroup
        title="Payload fields"
        headerValue={formatPayloadHex(decoded.rawPayloadHex)}
        fields={decoded.payloadDecodedFields}
        expandedKey={expandedKey}
        onToggleExpanded={toggleExpanded}
        onOpenField={(field) => onOpenField?.(field, decoded)}
        pinnedFields={pinnedFields}
        onTogglePin={onTogglePin}
        pinnableIds={pinnableIds}
      />

      {decoded.errorCode != null && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs">
          Error {decoded.errorCode}: {decoded.errorText ?? "Unknown error code"}
        </div>
      )}
    </div>
  );
}
