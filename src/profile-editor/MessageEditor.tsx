import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Braces, Eye, ChevronDown, ChevronRight, ChevronLeft, Grid3x3 } from "lucide-react";
import { CanIdBitGridEditor } from "@/profile-editor/bit-strip/CanIdBitGridEditor";
import { DecodedPreviewPanel } from "@/profile-editor/DecodedPreviewPanel";
import { FieldCard } from "@/profile-editor/FieldCard";
import { ScopedJsonEditor } from "@/profile-editor/ScopedJsonEditor";
import { SideDrawer } from "@/profile-editor/SideDrawer";
import { decodeFrameWithProfile } from "@/profile-editor/decodeProfile";
import type { CanonicalField, CanonicalProfile, CanonicalVariant } from "@/profile-editor/model/canonicalProfile";
import { resolveProfileReferences, useProfileStore } from "@/profile-editor/store/profileStore";
import { validateBitLayout } from "@/profile-editor/validation/validateBitLayout";
import { mapBitErrors } from "@/profile-editor/validation/mapBitErrors";
import { buildIdentifier, createField, hexToBytes, identifyByFromVariantKey, reorderInPlace, updateField, byteLength } from "@/profile-editor/profileFieldHelpers";

type Mode = "visual" | "json";

const DECODED_WIDTH_KEY = "cansim.profileEditor.decodedPreviewWidth.v1";

function readDecodedWidth(): number {
  const stored = Number(localStorage.getItem(DECODED_WIDTH_KEY));
  return stored >= 240 && stored <= 640 ? stored : 340;
}

// Locates a variant by its own `.id` (the messageId prop — stable regardless
// of the discriminator key it's registered under) across
// profile.payload.variants, which can hold either one CanonicalVariant or
// an array of them per key (see CanonicalProfile.payload.variants doc).
// `index` is null for a non-colliding (single-value) key.
type VariantLocation = { key: string; index: number | null };

function findVariantLocation(profile: CanonicalProfile, id: string): VariantLocation | undefined {
  for (const [key, entry] of Object.entries(profile.payload.variants)) {
    if (Array.isArray(entry)) {
      const index = entry.findIndex((variant) => variant.id === id);
      if (index >= 0) return { key, index };
    } else if (entry.id === id) {
      return { key, index: null };
    }
  }
  return undefined;
}

function getVariant(profile: CanonicalProfile, location: VariantLocation): CanonicalVariant | undefined {
  const entry = profile.payload.variants[location.key];
  if (!entry) return undefined;
  if (Array.isArray(entry)) return location.index != null ? entry[location.index] : undefined;
  return location.index == null ? entry : undefined;
}

// The actual message editor — bit grid, field cards, decoded preview,
// JSON toggle, delete. Two presentations share this one implementation:
// "drawer" (a floating SideDrawer popup, opened from the Messages grid)
// and "inline" (embedded directly in a page layout — the list view's
// right-hand pane, or a table row's expanded detail — with the same
// fixed/centered width so it never stretches to fill its container).
export function MessageEditor({ messageId, onClose, layout = "drawer" }: { messageId: string; onClose: () => void; layout?: "drawer" | "inline" }) {
  const rawProfile = useProfileStore((s) => s.profile);
  const rawDraftProfile = useProfileStore((s) => s.draftProfile);
  const selectedFramePayloadHex = useProfileStore((s) => s.selectedFramePayloadHex);
  const updateDraftProfile = useProfileStore((s) => s.updateDraftProfile);
  const [mode, setMode] = useState<Mode>("visual");
  // Bit grid starts collapsed in the drawer/table popup (field cards are the
  // primary view there) but open in the list view's inline editor, where
  // it's the first thing visible in the pane rather than a click away.
  const [gridOpen, setGridOpen] = useState(layout === "inline");
  const [showDecoded, setShowDecoded] = useState(false);
  const [decodedWidth, setDecodedWidth] = useState(() => readDecodedWidth());
  const resizingDecoded = useRef(false);
  const latestDecodedWidth = useRef(decodedWidth);

  function startResizeDecoded(event: React.MouseEvent) {
    event.preventDefault();
    resizingDecoded.current = true;
    const startX = event.clientX;
    const startWidth = decodedWidth;
    function onMove(moveEvent: MouseEvent) {
      if (!resizingDecoded.current) return;
      const delta = startX - moveEvent.clientX;
      const next = Math.min(640, Math.max(240, startWidth + delta));
      latestDecodedWidth.current = next;
      setDecodedWidth(next);
    }
    function onUp() {
      resizingDecoded.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      localStorage.setItem(DECODED_WIDTH_KEY, String(latestDecodedWidth.current));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  const [activeFieldIndex, setActiveFieldIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [jsonParseError, setJsonParseError] = useState<string | undefined>();

  const profile = useMemo(() => resolveProfileReferences(rawProfile), [rawProfile]);
  const draftProfile = useMemo(() => resolveProfileReferences(rawDraftProfile), [rawDraftProfile]);
  const activeProfile = draftProfile ?? profile;
  const editable = Boolean(draftProfile);
  const location = activeProfile ? findVariantLocation(activeProfile, messageId) : undefined;
  const message = activeProfile && location ? getVariant(activeProfile, location) : undefined;

  const bytes = useMemo(() => hexToBytes(selectedFramePayloadHex ?? ""), [selectedFramePayloadHex]);
  const decodedPreview = useMemo(() => {
    if (!activeProfile || !message || !location) return null;
    const identifyBy = identifyByFromVariantKey(activeProfile.payload.discriminator, location.key);
    const id = buildIdentifier(activeProfile.layouts.canId.fields, identifyBy);
    return decodeFrameWithProfile(activeProfile, {
      type: "frame",
      id,
      data_hex: selectedFramePayloadHex ?? "",
      iface: "",
      ts_ms: Date.now(),
      dir: "rx",
      is_fd: bytes.length > 8 || activeProfile.bus.type === "can-fd",
    });
  }, [activeProfile, bytes.length, message, location, selectedFramePayloadHex]);

  const fieldErrors = useMemo(() => (message ? mapBitErrors(validateBitLayout(message.payload.fields)) : {}), [message]);

  if (!activeProfile || !message) return null;

  function withTargetVariant(draft: CanonicalProfile, mutate: (variant: CanonicalVariant) => void) {
    const targetLocation = findVariantLocation(draft, messageId);
    if (!targetLocation) return;
    const variant = getVariant(draft, targetLocation);
    if (variant) mutate(variant);
  }

  function patchMessage(patch: Partial<CanonicalVariant>) {
    updateDraftProfile((draft) => withTargetVariant(draft, (variant) => Object.assign(variant, patch)));
  }

  function patchField(index: number, patch: Partial<CanonicalField>) {
    updateDraftProfile((draft) => withTargetVariant(draft, (variant) => updateField(variant.payload.fields, index, patch)));
  }

  function addField() {
    updateDraftProfile((draft) =>
      withTargetVariant(draft, (variant) => {
        variant.payload.fields.push(createField(variant.payload.fields.length));
        variant.payload.bitLength = Math.max(variant.payload.bitLength, 8);
      }),
    );
  }

  function deleteField(index: number) {
    updateDraftProfile((draft) => withTargetVariant(draft, (variant) => variant.payload.fields.splice(index, 1)));
  }

  function reorderField(from: number, to: number) {
    updateDraftProfile((draft) => withTargetVariant(draft, (variant) => reorderInPlace(variant.payload.fields, from, to)));
  }

  function deleteMessage() {
    if (!message) return;
    if (!window.confirm(`Delete message "${message.label || message.id}"? This cannot be undone.`)) return;
    updateDraftProfile((draft) => {
      const targetLocation = findVariantLocation(draft, messageId);
      if (!targetLocation) return;
      const entry = draft.payload.variants[targetLocation.key];
      if (Array.isArray(entry) && targetLocation.index != null) {
        entry.splice(targetLocation.index, 1);
        if (entry.length === 0) delete draft.payload.variants[targetLocation.key];
        else if (entry.length === 1) draft.payload.variants[targetLocation.key] = entry[0];
      } else {
        delete draft.payload.variants[targetLocation.key];
      }
    });
    onClose();
  }

  function onMessageJsonChange(text: string) {
    try {
      const parsed = JSON.parse(text) as CanonicalVariant;
      setJsonParseError(undefined);
      updateDraftProfile((draft) => {
        const targetLocation = findVariantLocation(draft, messageId);
        if (!targetLocation) return;
        const entry = draft.payload.variants[targetLocation.key];
        if (Array.isArray(entry) && targetLocation.index != null) entry[targetLocation.index] = parsed;
        else draft.payload.variants[targetLocation.key] = parsed;
      });
    } catch (e) {
      setJsonParseError(e instanceof Error ? e.message : String(e));
    }
  }

  const gridBitLength = Math.max(8, message.payload.bitLength, ...message.payload.fields.map((f) => f.startBit + f.bitLength), 0);
  const overlapCount = Object.values(fieldErrors).flat().length / 2;
  const dictionaries = Object.keys(activeProfile.dictionaries ?? {});
  // The fields column keeps a fixed width — opening the decoded preview
  // grows the popup to the right to fit it, instead of squeezing fields.
  // Inline presentations reuse this same width so the editor is always a
  // fixed, centered block rather than stretching to fill its container.
  const fieldsColumnWidth = 520;
  const visualWidth = fieldsColumnWidth + (showDecoded ? decodedWidth : 40);

  const headerContent = (
    <>
      <Input
        className="h-8 rounded border-transparent bg-muted/40 px-1.5 text-base font-semibold shadow-none hover:bg-muted/60 focus-visible:border-ring focus-visible:bg-background"
        value={message.label}
        disabled={!editable}
        onChange={(event) => patchMessage({ label: event.target.value })}
      />
      <div className="mt-2 flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground" title={message.id}>
          {message.id}
        </span>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] text-muted-foreground">
          {activeProfile.bus.byteOrder} · {byteLength(message.payload.bitLength)}B
        </span>
        {overlapCount > 0 && (
          <span className="shrink-0 rounded-full border border-destructive px-2 py-0.5 text-[10.5px] font-medium text-destructive">{overlapCount} overlap</span>
        )}
      </div>
    </>
  );

  const modeToggle = (
    <div className="flex shrink-0 rounded-md border p-0.5">
      <button
        type="button"
        onClick={() => setMode("visual")}
        className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${mode === "visual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
      >
        <Eye className="h-3 w-3" /> Visual
      </button>
      <button
        type="button"
        onClick={() => setMode("json")}
        className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${mode === "json" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
      >
        <Braces className="h-3 w-3" /> JSON
      </button>
    </div>
  );

  const footerContent = (
    <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground" disabled={!editable} onClick={deleteMessage}>
      <Trash2 className="h-4 w-4" />
      Delete message
    </Button>
  );

  const bodyContent =
    mode === "json" ? (
      <div style={{ height: "min(70vh, 640px)" }} className="flex flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fields</span>
          {modeToggle}
        </div>
        <div className="min-h-0 flex-1">
          <ScopedJsonEditor value={JSON.stringify(message, null, 2)} onChange={onMessageJsonChange} readOnly={!editable} error={jsonParseError} />
        </div>
      </div>
    ) : (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fields</span>
          {modeToggle}
        </div>
        <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <section className="rounded-lg border bg-background">
              <button
                type="button"
                onClick={() => setGridOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {gridOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Grid3x3 className="h-3.5 w-3.5" />
                Bit grid {gridOpen ? "" : "(click a bit to jump to its field)"}
              </button>
              {gridOpen && (
                <div className="overflow-x-auto px-3 pb-3">
                  <CanIdBitGridEditor
                    bitLength={gridBitLength}
                    fields={message.payload.fields}
                    activeFieldName={activeFieldIndex != null ? message.payload.fields[activeFieldIndex]?.name ?? null : null}
                    onSelectField={(name) => {
                      const index = message.payload.fields.findIndex((f) => f.name === name);
                      setActiveFieldIndex(index >= 0 ? index : null);
                    }}
                  />
                </div>
              )}
            </section>

            <section className="space-y-1.5">
              {message.payload.fields.map((field, index) => (
                <FieldCard
                  key={index}
                  field={field}
                  editable={editable}
                  selected={activeFieldIndex === index}
                  errors={fieldErrors[field.name]}
                  dictionaries={dictionaries}
                  onSelect={() => setActiveFieldIndex(activeFieldIndex === index ? null : index)}
                  onChange={(patch) => patchField(index, patch)}
                  onDelete={() => deleteField(index)}
                  onCreateDictionary={(name) =>
                    updateDraftProfile((draft) => {
                      draft.dictionaries ??= {};
                      if (!draft.dictionaries[name]) draft.dictionaries[name] = { "0": "Value 0" };
                    })
                  }
                  draggable={editable}
                  isDragging={dragIndex === index}
                  isDragOver={dragOverIndex === index}
                  onDragStart={() => setDragIndex(index)}
                  onDragEnter={() => setDragOverIndex(index)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== index) reorderField(dragIndex, index);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                />
              ))}
              <Button size="sm" variant="outline" className="w-full" disabled={!editable} onClick={addField}>
                <Plus className="h-3.5 w-3.5" />
                Field
              </Button>
            </section>
          </div>
        </div>

        <div
          className="relative flex min-h-0 shrink-0 flex-col border-l bg-muted/20"
          style={{ width: showDecoded ? decodedWidth : 40 }}
        >
          {showDecoded && (
            <div
              onMouseDown={startResizeDecoded}
              className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize"
              title="Drag to resize"
            />
          )}
          {showDecoded ? (
            <>
              <div className="flex shrink-0 items-center justify-between border-b p-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decoded preview</span>
                <button type="button" onClick={() => setShowDecoded(false)} className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
                <div className="rounded-md border bg-muted/30 p-2.5">
                  <div className="text-[10.5px] text-muted-foreground">Selected payload</div>
                  <div className="mt-0.5 break-all font-mono text-xs">{selectedFramePayloadHex || "No trace payload selected"}</div>
                </div>
                <DecodedPreviewPanel decoded={decodedPreview} />
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowDecoded(true)}
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
              title="Show decoded preview"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ writingMode: "vertical-rl" }}>
                Decoded preview
              </span>
            </button>
          )}
        </div>
        </div>
      </div>
    );

  if (layout === "drawer") {
    return (
      <SideDrawer onClose={onClose} maxWidth={`${visualWidth}px`} bodyClassName={mode === "visual" ? "overflow-hidden" : "overflow-auto p-4"} header={headerContent} footer={footerContent}>
        {bodyContent}
      </SideDrawer>
    );
  }

  return (
    <div className="flex h-full min-h-0 justify-center">
      <div
        className="flex max-h-[80vh] min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
        style={{ width: `${visualWidth}px`, maxWidth: "100%", minWidth: 420 }}
      >
        <div className="flex shrink-0 items-start gap-2 border-b p-4">
          <div className="min-w-0 flex-1">{headerContent}</div>
        </div>
        <div className={`min-h-0 flex-1 ${mode === "visual" ? "overflow-hidden" : "overflow-auto p-4"}`}>{bodyContent}</div>
        <div className="flex shrink-0 justify-end border-t p-3">{footerContent}</div>
      </div>
    </div>
  );
}
