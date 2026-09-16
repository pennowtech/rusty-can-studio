import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Eye, Braces } from "lucide-react";
import { CanIdBitGridEditor } from "@/profile-editor/bit-strip/CanIdBitGridEditor";
import { FieldCard } from "@/profile-editor/FieldCard";
import { ScopedJsonEditor } from "@/profile-editor/ScopedJsonEditor";
import type { CanonicalField, CanonicalProfile } from "@/profile-editor/model/canonicalProfile";
import {
  describeCanIdSource,
  describePayloadCommonSource,
  resolveProfileReferences,
  useProfileStore,
  type LayoutSource,
} from "@/profile-editor/store/profileStore";
import { createField, reorderInPlace, updateField } from "@/profile-editor/profileFieldHelpers";
import { mapBitErrors } from "@/profile-editor/validation/mapBitErrors";
import { validateBitLayout } from "@/profile-editor/validation/validateBitLayout";

export type ProfileTab = "profile" | "can-id" | "payload-header" | "dictionaries" | "errors";

function useActiveProfile() {
  const rawProfile = useProfileStore((s) => s.profile);
  const rawDraftProfile = useProfileStore((s) => s.draftProfile);
  const updateDraftProfile = useProfileStore((s) => s.updateDraftProfile);
  const loadedProfiles = useProfileStore((s) => s.loadedProfiles);
  const loadedProfileFileNames = useProfileStore((s) => s.loadedProfileFileNames);
  const selectLoadedProfile = useProfileStore((s) => s.selectLoadedProfile);
  const profile = useMemo(() => resolveProfileReferences(rawProfile), [rawProfile]);
  const draftProfile = useMemo(() => resolveProfileReferences(rawDraftProfile), [rawDraftProfile]);
  const activeProfile = draftProfile ?? profile;
  const editable = Boolean(draftProfile);

  // Computed against the UNMERGED base (not activeProfile, which already
  // has any resolved/inherited layout merged in) — this is "where does
  // this profile's own layout come from", not "what does it resolve to".
  const rawBase = rawDraftProfile ?? rawProfile;
  const canIdSource = rawBase ? describeCanIdSource(rawBase, loadedProfiles, loadedProfileFileNames) : { kind: "own" as const };
  const payloadCommonSource = rawBase ? describePayloadCommonSource(rawBase, loadedProfiles, loadedProfileFileNames) : { kind: "own" as const };

  function updateProfile(updater: (draft: CanonicalProfile) => void) {
    updateDraftProfile((draft) => {
      if (!("schemaVersion" in draft)) return;
      updater(draft as unknown as CanonicalProfile);
    });
  }

  return {
    activeProfile,
    editable,
    updateProfile,
    canIdSource,
    payloadCommonSource,
    loadedProfiles,
    switchToProfile: selectLoadedProfile,
    hasOtherLoadedProfiles: loadedProfiles.length > 1,
  };
}

// Explains where a CAN-ID layout / payload common layout actually comes from
// when this profile references another file (`ref_file`) instead of
// defining its own.
function LayoutSourceBanner({
  source,
  loadedProfiles,
  switchToProfile,
  label,
}: {
  source: LayoutSource;
  loadedProfiles: CanonicalProfile[];
  switchToProfile: (index: number) => void;
  label: string;
}) {
  if (source.kind === "own") return null;

  if (source.donorIndex == null) {
    return (
      <div className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
        References <span className="font-mono font-medium">{source.refFile}</span>, but it isn't currently loaded — load it alongside this profile (Load Profile JSON accepts multiple files at once).
      </div>
    );
  }

  const donorName = loadedProfiles[source.donorIndex].meta.name;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed bg-muted/30 p-3 text-xs">
      <span className="text-muted-foreground">
        Referenced from <span className="font-mono font-medium text-foreground">{source.refFile}</span> (loaded as <span className="font-medium text-foreground">{donorName}</span>) — this profile doesn't define its own {label}.
      </span>
      <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => switchToProfile(source.donorIndex!)}>
        Switch to {donorName}
      </Button>
    </div>
  );
}

// Same field-card list used by the message drawer, shown here for the
// CAN-ID layout and payload-header tabs so all three field-editing
// surfaces (message / CAN-ID / payload common) look and behave the same.
function FieldCardList({
  fields,
  editable,
  dictionaries,
  activeFieldIndex,
  onActiveFieldIndexChange,
  onChange,
  onAdd,
  onDelete,
  onReorder,
  onCreateDictionary,
}: {
  fields: CanonicalField[];
  editable: boolean;
  dictionaries: string[];
  activeFieldIndex: number | null;
  onActiveFieldIndexChange: (index: number | null) => void;
  onChange: (index: number, patch: Partial<CanonicalField>) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onCreateDictionary: (name: string) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const fieldErrors = useMemo(() => mapBitErrors(validateBitLayout(fields)), [fields]);

  return (
    <section className="space-y-1.5">
      {fields.map((field, index) => (
        <FieldCard
          key={index}
          field={field}
          editable={editable}
          selected={activeFieldIndex === index}
          errors={fieldErrors[field.name]}
          dictionaries={dictionaries}
          onSelect={() => onActiveFieldIndexChange(activeFieldIndex === index ? null : index)}
          onChange={(patch) => onChange(index, patch)}
          onDelete={() => onDelete(index)}
          onCreateDictionary={onCreateDictionary}
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
            if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index);
            setDragIndex(null);
            setDragOverIndex(null);
          }}
        />
      ))}
      {fields.length === 0 && <div className="text-sm text-muted-foreground">No fields yet.</div>}
      <Button size="sm" variant="outline" className="w-full" disabled={!editable} onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
        Field
      </Button>
    </section>
  );
}

function ProfileGeneralTab() {
  const { activeProfile, editable, updateProfile } = useActiveProfile();
  if (!activeProfile) return null;
  return (
    <div className="space-y-6">
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:col-span-2">Metadata</div>
        <label className="space-y-1 text-xs font-medium">
          ID
          <Input value={activeProfile.meta.id} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.meta.id = event.target.value))} />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Version
          <Input value={activeProfile.meta.version} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.meta.version = event.target.value))} />
        </label>
        <label className="space-y-1 text-xs font-medium lg:col-span-2">
          Name
          <Input value={activeProfile.meta.name} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.meta.name = event.target.value))} />
        </label>
        <label className="space-y-1 text-xs font-medium lg:col-span-2">
          Description
          <Input value={activeProfile.meta.description ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.meta.description = event.target.value || undefined))} />
        </label>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:col-span-3">Bus</div>
        <label className="space-y-1 text-xs font-medium">
          Bus type
          <Select value={activeProfile.bus.type} disabled={!editable} onValueChange={(value) => updateProfile((draft) => void (draft.bus.type = value as CanonicalProfile["bus"]["type"]))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="can">CAN</SelectItem>
              <SelectItem value="can-fd">CAN-FD</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          ID format
          <Select value={activeProfile.bus.idFormat} disabled={!editable} onValueChange={(value) => updateProfile((draft) => void (draft.bus.idFormat = value as CanonicalProfile["bus"]["idFormat"]))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">standard</SelectItem>
              <SelectItem value="extended">extended</SelectItem>
              <SelectItem value="custom">custom</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Byte order
          <Select value={activeProfile.bus.byteOrder} disabled={!editable} onValueChange={(value) => updateProfile((draft) => void (draft.bus.byteOrder = value as CanonicalProfile["bus"]["byteOrder"]))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="little">little</SelectItem>
              <SelectItem value="big">big</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </section>
    </div>
  );
}

function CanIdLayoutTab() {
  const { activeProfile, editable: draftEditable, updateProfile, canIdSource, loadedProfiles, switchToProfile } = useActiveProfile();
  const [activeFieldIndex, setActiveFieldIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<"visual" | "json">("visual");
  const [jsonParseError, setJsonParseError] = useState<string | undefined>();
  if (!activeProfile) return null;
  const layout = activeProfile.layouts.canId;
  // A referenced layout is read-only here — edit it on the profile that
  // actually owns it (jump there via the banner below).
  const editable = draftEditable && canIdSource.kind === "own";
  const canConvertToRef = canIdSource.kind === "own" && layout.fields.length > 0;

  function onLayoutJsonChange(text: string) {
    try {
      const parsed = JSON.parse(text);
      setJsonParseError(undefined);
      updateProfile((draft) => void (draft.layouts.canId = parsed));
    } catch (e) {
      setJsonParseError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <LayoutSourceBanner source={canIdSource} loadedProfiles={loadedProfiles} switchToProfile={switchToProfile} label="CAN ID layout" />

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fields</span>
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
      </div>

      {mode === "json" ? (
        <div style={{ height: "min(70vh, 640px)" }}>
          <ScopedJsonEditor value={JSON.stringify(layout, null, 2)} onChange={onLayoutJsonChange} readOnly={!editable} error={jsonParseError} />
        </div>
      ) : (
        <>
          <section className="grid gap-3 lg:grid-cols-3">
            <label className="space-y-1 text-xs font-medium">
              Label
              <Input value={layout.label ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.layouts.canId.label = event.target.value || undefined))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Bit length
              <Input type="number" value={layout.bitLength} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.layouts.canId.bitLength = Number(event.target.value)))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Note
              <Input value={layout.note ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.layouts.canId.note = event.target.value || undefined))} />
            </label>
          </section>

          {/* Fixed width, centered — matches the message drawer's fields column
              (MessageEditorDrawer's fieldsColumnWidth) rather than stretching
              to use the tab's full width. */}
          <div className="mx-auto w-full max-w-[520px] space-y-4">
            <section className="rounded-lg border bg-background p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bit layout</div>
              <CanIdBitGridEditor
                bitLength={Math.max(8, layout.bitLength, ...layout.fields.map((f) => f.startBit + f.bitLength))}
                fields={layout.fields}
                activeFieldName={activeFieldIndex != null ? layout.fields[activeFieldIndex]?.name ?? null : null}
                onSelectField={(name) => {
                  const index = layout.fields.findIndex((f) => f.name === name);
                  setActiveFieldIndex(index >= 0 ? index : null);
                }}
              />
            </section>

            <FieldCardList
              fields={layout.fields}
              editable={editable}
              dictionaries={Object.keys(activeProfile.dictionaries ?? {})}
              activeFieldIndex={activeFieldIndex}
              onActiveFieldIndexChange={setActiveFieldIndex}
              onChange={(index, patch) => updateProfile((draft) => updateField(draft.layouts.canId.fields, index, patch))}
              onAdd={() => updateProfile((draft) => draft.layouts.canId.fields.push(createField(draft.layouts.canId.fields.length)))}
              onDelete={(index) => updateProfile((draft) => draft.layouts.canId.fields.splice(index, 1))}
              onReorder={(from, to) => updateProfile((draft) => reorderInPlace(draft.layouts.canId.fields, from, to))}
              onCreateDictionary={(name) =>
                updateProfile((draft) => {
                  draft.dictionaries ??= {};
                  if (!draft.dictionaries[name]) draft.dictionaries[name] = { "0": "Value 0" };
                })
              }
            />
            {canConvertToRef && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  const refFile = window.prompt("Reference which file's CAN ID layout? (e.g. k2_common.json)");
                  if (!refFile) return;
                  if (!window.confirm(`Clear this profile's own CAN ID layout fields and reference "${refFile}" instead? This deletes its fields — cannot be undone.`)) return;
                  updateProfile((draft) => {
                    draft.layouts.canId.fields = [];
                    draft.layouts.canId.ref_file = refFile;
                  });
                }}
              >
                Reference a shared CAN ID layout file instead
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PayloadHeaderTab() {
  const { activeProfile, editable: draftEditable, updateProfile, payloadCommonSource, loadedProfiles, switchToProfile } = useActiveProfile();
  const [activeFieldIndex, setActiveFieldIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<"visual" | "json">("visual");
  const [jsonParseError, setJsonParseError] = useState<string | undefined>();
  if (!activeProfile) return null;
  const header = activeProfile.payload.common;
  const editable = draftEditable && payloadCommonSource.kind === "own";

  if (!header) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        This profile does not define common payload fields.
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!draftEditable}
            onClick={() => updateProfile((draft) => void (draft.payload.common = { label: "Payload common", bitLength: 0, fields: [] }))}
          >
            <Plus className="h-4 w-4" />
            Add payload common fields
          </Button>
        </div>
      </div>
    );
  }

  const canConvertToRef = payloadCommonSource.kind === "own" && header.fields.length > 0;

  function onHeaderJsonChange(text: string) {
    try {
      const parsed = JSON.parse(text);
      setJsonParseError(undefined);
      updateProfile((draft) => void (draft.payload.common = parsed));
    } catch (e) {
      setJsonParseError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <LayoutSourceBanner source={payloadCommonSource} loadedProfiles={loadedProfiles} switchToProfile={switchToProfile} label="payload common fields" />

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fields</span>
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
      </div>

      {mode === "json" ? (
        <div style={{ height: "min(70vh, 640px)" }}>
          <ScopedJsonEditor value={JSON.stringify(header, null, 2)} onChange={onHeaderJsonChange} readOnly={!editable} error={jsonParseError} />
        </div>
      ) : (
        <>
          <section className="grid gap-3 lg:grid-cols-3">
            <label className="space-y-1 text-xs font-medium">
              Label
              <Input value={header.label ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.payload.common!.label = event.target.value || undefined))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Bit length
              <Input type="number" value={header.bitLength} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.payload.common!.bitLength = Number(event.target.value)))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Note
              <Input value={header.note ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.payload.common!.note = event.target.value || undefined))} />
            </label>
          </section>

          {/* Fixed width, centered — matches the message drawer's fields column
              (MessageEditorDrawer's fieldsColumnWidth) rather than stretching
              to use the tab's full width. */}
          <div className="mx-auto w-full max-w-[520px] space-y-4">
            <section className="rounded-lg border bg-background p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bit layout</div>
              <CanIdBitGridEditor
                bitLength={Math.max(8, header.bitLength, ...header.fields.map((f) => f.startBit + f.bitLength))}
                fields={header.fields}
                activeFieldName={activeFieldIndex != null ? header.fields[activeFieldIndex]?.name ?? null : null}
                onSelectField={(name) => {
                  const index = header.fields.findIndex((f) => f.name === name);
                  setActiveFieldIndex(index >= 0 ? index : null);
                }}
              />
            </section>

            <FieldCardList
              fields={header.fields}
              editable={editable}
              dictionaries={Object.keys(activeProfile.dictionaries ?? {})}
              activeFieldIndex={activeFieldIndex}
              onActiveFieldIndexChange={setActiveFieldIndex}
              onChange={(index, patch) => updateProfile((draft) => updateField(draft.payload.common!.fields, index, patch))}
              onAdd={() => updateProfile((draft) => draft.payload.common!.fields.push(createField(draft.payload.common!.fields.length)))}
              onDelete={(index) => updateProfile((draft) => draft.payload.common!.fields.splice(index, 1))}
              onReorder={(from, to) => updateProfile((draft) => reorderInPlace(draft.payload.common!.fields, from, to))}
              onCreateDictionary={(name) =>
                updateProfile((draft) => {
                  draft.dictionaries ??= {};
                  if (!draft.dictionaries[name]) draft.dictionaries[name] = { "0": "Value 0" };
                })
              }
            />
            {canConvertToRef && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  const refFile = window.prompt("Reference which file's payload common fields? (e.g. k2_common.json)");
                  if (!refFile) return;
                  if (!window.confirm(`Clear this profile's own payload common fields and reference "${refFile}" instead? This deletes its fields — cannot be undone.`)) return;
                  updateProfile((draft) => {
                    draft.payload.common!.fields = [];
                    draft.payload.common!.ref_file = refFile;
                  });
                }}
              >
                Reference a shared payload common file instead
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DictionariesTab({ onOpen }: { onOpen: (key: string) => void }) {
  const { activeProfile, editable, updateProfile } = useActiveProfile();
  if (!activeProfile) return null;
  const dictionaries = Object.entries(activeProfile.dictionaries ?? {});

  function addDictionary() {
    updateProfile((draft) => {
      draft.dictionaries ??= {};
      let index = 1;
      let name = `dictionary_${index}`;
      while (draft.dictionaries[name]) {
        index++;
        name = `dictionary_${index}`;
      }
      draft.dictionaries[name] = { "0": "Value 0" };
      onOpen(name);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dictionaries — numeric-to-text labels used by decoded fields</div>
        <Button size="sm" variant="outline" disabled={!editable} onClick={addDictionary}>
          <Plus className="h-4 w-4" />
          Dictionary
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
        {dictionaries.map(([key, values]) => (
          <button key={key} type="button" title={key} onClick={() => onOpen(key)} className="min-w-0 rounded-lg border bg-card p-3 text-left shadow-sm hover:border-primary">
            <div className="truncate font-mono text-sm font-semibold">{key}</div>
            <div className="text-xs text-muted-foreground">{Object.keys(values).length} values</div>
          </button>
        ))}
        {dictionaries.length === 0 && <div className="text-sm text-muted-foreground">No dictionaries yet.</div>}
      </div>
    </div>
  );
}

function ErrorsTab({ onOpen }: { onOpen: (errorId: string) => void }) {
  const { activeProfile, editable, updateProfile } = useActiveProfile();
  if (!activeProfile) return null;
  const errors = activeProfile.errors ?? [];

  function addError() {
    let index = 1;
    let id = `error_${index}`;
    while (errors.some((e) => e.id === id)) {
      index++;
      id = `error_${index}`;
    }
    updateProfile((draft) => {
      draft.errors ??= [];
      draft.errors.push({ id, when: "", source: { startBit: 0, bitLength: 8, type: "uint" } });
    });
    onOpen(id);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Error rules — mapped from decoded frame data to error severity/messages</div>
        <Button size="sm" variant="outline" disabled={!editable} onClick={addError}>
          <Plus className="h-4 w-4" />
          Error rule
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
        {errors.map((error) => (
          <button key={error.id} type="button" title={error.id} onClick={() => onOpen(error.id)} className="min-w-0 rounded-lg border bg-card p-3 text-left shadow-sm hover:border-primary">
            <div className="truncate font-mono text-sm font-semibold">{error.id}</div>
            <div className="truncate text-xs text-muted-foreground" title={error.when}>{error.when || "(no condition set)"}</div>
            <div className="mt-1 text-[10.5px] text-muted-foreground">{error.source.type} · bits {error.source.startBit}-{error.source.startBit + error.source.bitLength - 1}</div>
          </button>
        ))}
        {errors.length === 0 && <div className="text-sm text-muted-foreground">No error rules yet.</div>}
      </div>
    </div>
  );
}

export function ProfileTabContent({ tab, onOpenDictionary, onOpenError }: { tab: ProfileTab; onOpenDictionary: (key: string) => void; onOpenError: (id: string) => void }) {
  if (tab === "profile") return <ProfileGeneralTab />;
  if (tab === "can-id") return <CanIdLayoutTab />;
  if (tab === "payload-header") return <PayloadHeaderTab />;
  if (tab === "dictionaries") return <DictionariesTab onOpen={onOpenDictionary} />;
  return <ErrorsTab onOpen={onOpenError} />;
}
