import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Braces, Eye } from "lucide-react";
import { ScopedJsonEditor } from "@/profile-editor/ScopedJsonEditor";
import { SideDrawer } from "@/profile-editor/SideDrawer";
import type { CanonicalField } from "@/profile-editor/model/canonicalProfile";
import { resolveProfileReferences, useProfileStore } from "@/profile-editor/store/profileStore";

type Mode = "visual" | "json";

export function DictionaryEditorDrawer({ dictKey, onClose, onRenamed }: { dictKey: string; onClose: () => void; onRenamed: (nextKey: string) => void }) {
  const rawProfile = useProfileStore((s) => s.profile);
  const rawDraftProfile = useProfileStore((s) => s.draftProfile);
  const updateDraftProfile = useProfileStore((s) => s.updateDraftProfile);
  const [mode, setMode] = useState<Mode>("visual");
  const [jsonParseError, setJsonParseError] = useState<string | undefined>();
  const [rows, setRows] = useState<{ code: string; label: string }[]>([]);

  const profile = resolveProfileReferences(rawProfile);
  const draftProfile = resolveProfileReferences(rawDraftProfile);
  const activeProfile = draftProfile ?? profile;
  const editable = Boolean(draftProfile);
  const values = activeProfile?.dictionaries?.[dictKey];

  useEffect(() => {
    setRows(Object.entries(values ?? {}).map(([code, label]) => ({ code, label })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictKey, JSON.stringify(values ?? {})]);

  if (!activeProfile || !values) return null;

  function commitRows(next: { code: string; label: string }[]) {
    setRows(next);
    updateDraftProfile((draft) => {
      draft.dictionaries ??= {};
      const dict: Record<string, string> = {};
      next.forEach((row) => (dict[row.code] = row.label));
      draft.dictionaries[dictKey] = dict;
    });
  }

  function onJsonChange(text: string) {
    try {
      const parsed = JSON.parse(text) as Record<string, string>;
      setJsonParseError(undefined);
      updateDraftProfile((draft) => {
        draft.dictionaries ??= {};
        draft.dictionaries[dictKey] = parsed;
      });
    } catch (e) {
      setJsonParseError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SideDrawer
      onClose={onClose}
      header={
        <>
          <Input
            className="h-8 rounded border-transparent bg-muted/40 px-1.5 font-mono text-base font-semibold shadow-none hover:bg-muted/60 focus-visible:border-ring focus-visible:bg-background"
            value={dictKey}
            disabled={!editable}
            onChange={(event) => {
              const newKey = event.target.value.trim().replace(/[^a-zA-Z0-9_]/g, "_");
              if (!newKey || newKey === dictKey) return;
              updateDraftProfile((draft) => {
                if (!draft.dictionaries) return;
                draft.dictionaries[newKey] = draft.dictionaries[dictKey];
                delete draft.dictionaries[dictKey];
                const renameInFields = (fields: CanonicalField[]) => {
                  for (const field of fields) if (field.dictionary === dictKey) field.dictionary = newKey;
                };
                renameInFields(draft.layouts.canId.fields);
                if (draft.payload.common) renameInFields(draft.payload.common.fields);
                for (const entry of Object.values(draft.payload.variants)) {
                  for (const variant of Array.isArray(entry) ? entry : [entry]) renameInFields(variant.payload.fields);
                }
              });
              onRenamed(newKey);
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border px-2 py-0.5 text-[10.5px] text-muted-foreground">{rows.length} values</span>
            <div className="ml-auto flex shrink-0 rounded-md border p-0.5">
              <button type="button" onClick={() => setMode("visual")} className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${mode === "visual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <Eye className="h-3 w-3" /> Visual
              </button>
              <button type="button" onClick={() => setMode("json")} className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${mode === "json" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <Braces className="h-3 w-3" /> JSON
              </button>
            </div>
          </div>
        </>
      }
      footer={
        <Button
          variant="outline"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={!editable}
          onClick={() => {
            updateDraftProfile((draft) => {
              if (draft.dictionaries) delete draft.dictionaries[dictKey];
            });
            onClose();
          }}
        >
          <Trash2 className="h-4 w-4" />
          Delete dictionary
        </Button>
      }
    >
      {mode === "json" ? (
        <div style={{ height: "min(70vh, 640px)" }}>
          <ScopedJsonEditor value={JSON.stringify(values, null, 2)} onChange={onJsonChange} readOnly={!editable} error={jsonParseError} />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Entries</div>
            <Button
              size="sm"
              variant="outline"
              disabled={!editable}
              onClick={() => {
                let codeNum = 0;
                while (rows.some((r) => r.code === String(codeNum))) codeNum++;
                commitRows([...rows, { code: String(codeNum), label: "New Value" }]);
              }}
            >
              <Plus className="h-4 w-4" />
              Add entry
            </Button>
          </div>
          <div className="overflow-auto rounded-md border bg-background">
            <table className="w-max min-w-full table-fixed text-xs">
              <thead className="border-b bg-muted/40 uppercase text-muted-foreground">
                <tr>
                  <th className="w-32 px-3 py-2 text-left font-medium">Raw code</th>
                  <th className="px-3 py-2 text-left font-medium">Label</th>
                  <th className="w-12 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent font-mono shadow-none hover:bg-background focus-visible:border-ring" value={row.code} disabled={!editable} onChange={(event) => { const next = [...rows]; next[idx] = { ...next[idx], code: event.target.value }; commitRows(next); }} />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" value={row.label} disabled={!editable} onChange={(event) => { const next = [...rows]; next[idx] = { ...next[idx], label: event.target.value }; commitRows(next); }} />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={!editable} onClick={() => commitRows(rows.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No entries yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SideDrawer>
  );
}
