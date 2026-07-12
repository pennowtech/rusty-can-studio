import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RangeGridEditor } from "@/profile-editor/bit-strip/RangeGridEditor";
import type { BitFieldDef, CanIdField } from "@/profile-editor/model/profile";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { getProfileMessageSchema } from "@/profile-editor/profileAdapter";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

function formatCanIdBinary(canId: number | undefined) {
  if (canId == null) return "";
  return canId.toString(2).padStart(32, "0").replace(/(.{4})/g, "$1 ").trim();
}

export function ProfileCanIdLayoutEditor() {
  const profile = useProfileStore((s) => s.profile);
  const draftProfile = useProfileStore((s) => s.draftProfile);
  const selectedFrameKey = useProfileStore((s) => s.selectedFrameKey);
  const updateDraftProfile = useProfileStore((s) => s.updateDraftProfile);
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);
  const activeProfile = draftProfile ?? profile;
  const editable = Boolean(draftProfile);

  if (!activeProfile) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Import a profile or define a message structure from the CAN Monitor.</div>;
  }

  const frameEntries = Object.entries(activeProfile.frames ?? {});
  const activeFrame = selectedFrameKey && activeProfile.frames[selectedFrameKey] ? activeProfile.frames[selectedFrameKey] : frameEntries[0]?.[1];
  const layoutId = activeProfile.defaultCanIdLayoutId ?? activeProfile.canIdLayoutRef ?? Object.keys(activeProfile.canIdLayouts ?? {})[0] ?? "can_id";
  const schemaLayout = getProfileMessageSchema(activeProfile)?.canIdLayout;
  const layout = schemaLayout ?? activeProfile.canIdLayouts?.[layoutId];
  const fields = layout?.fields ?? [];

  function addField() {
    updateDraftProfile((draft) => {
      if (draft.messageSchema?.canIdLayout) {
        draft.messageSchema.canIdLayout.fields.push({
          name: `idField${draft.messageSchema.canIdLayout.fields.length + 1}`,
          startBit: 0,
          length: 1,
        });
        return;
      }

      draft.canIdLayouts ??= {};
      const id = draft.defaultCanIdLayoutId ?? draft.canIdLayoutRef ?? Object.keys(draft.canIdLayouts)[0] ?? "can_id";
      draft.defaultCanIdLayoutId = id;
      if (!draft.canIdLayouts[id]) {
        draft.canIdLayouts[id] = {
          id,
          name: "Universal CAN ID Layout",
          format: "extended",
          bitLength: 32,
          fields: [],
        };
      }
      draft.canIdLayouts[id].fields.push({
        name: `idField${draft.canIdLayouts[id].fields.length + 1}`,
        startBit: 0,
        length: 1,
      });
      for (const frame of Object.values(draft.frames)) {
        frame.canIdLayout = id;
      }
    });
  }

  function updateField(index: number, patch: Partial<CanIdField | BitFieldDef>) {
    updateDraftProfile((draft) => {
      if (draft.messageSchema?.canIdLayout) {
        draft.messageSchema.canIdLayout.fields[index] = {
          ...draft.messageSchema.canIdLayout.fields[index],
          ...patch,
        };
        return;
      }

      draft.canIdLayouts ??= {};
      const id = draft.defaultCanIdLayoutId ?? draft.canIdLayoutRef ?? Object.keys(draft.canIdLayouts)[0] ?? "can_id";
      if (!draft.canIdLayouts[id]) return;
      draft.canIdLayouts[id].fields[index] = {
        ...draft.canIdLayouts[id].fields[index],
        ...patch,
      };
    });
  }

  function deleteField(index: number) {
    updateDraftProfile((draft) => {
      if (draft.messageSchema?.canIdLayout) {
        draft.messageSchema.canIdLayout.fields.splice(index, 1);
        return;
      }

      draft.canIdLayouts ??= {};
      const id = draft.defaultCanIdLayoutId ?? draft.canIdLayoutRef ?? Object.keys(draft.canIdLayouts)[0] ?? "can_id";
      draft.canIdLayouts[id]?.fields.splice(index, 1);
    });
  }

  return (
    <div className="h-full min-h-0 overflow-auto pb-8 pr-1">
      <div className="rounded-lg border bg-background shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-3 py-2">
          <div>
            <div className="text-sm font-semibold">Universal CAN ID layout</div>
            <div className="text-xs text-muted-foreground">Defined once per profile and decoded for every message.</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {activeFrame?.canId != null ? `0x${activeFrame.canId.toString(16).toUpperCase().padStart(8, "0")}` : `${layout?.bitLength ?? 29} bits`}
            </Badge>
            <Button size="sm" onClick={addField} disabled={!editable}>
              <Plus className="h-4 w-4" />
              Add ID field
            </Button>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <div className="break-all font-mono text-xs text-muted-foreground">{formatCanIdBinary(activeFrame?.canId)}</div>
          <RangeGridEditor
            length={layout?.bitLength ?? 32}
            editable={editable}
            items={fields.map((field) => ({
              id: field.name,
              start: field.startBit,
              length: field.length,
              label: field.name,
            }))}
            activeItemId={activeField}
            hoverItemId={hoveredField}
            onHoverItem={setHoveredField}
            valueLabel={(bitIndex) => {
              if (activeFrame?.canId == null) return 0;
              return Math.floor(activeFrame.canId / 2 ** bitIndex) & 1;
            }}
            unitLabel={(bitIndex) => `${Math.floor(bitIndex / 8)}.${bitIndex % 8}`}
            onChange={(name, startBit, length) => {
              const index = fields.findIndex((field) => field.name === name);
              if (index >= 0) updateField(index, { startBit, length });
            }}
          />

          <div className="overflow-auto rounded-md bg-background">
            <table className="w-full table-auto text-xs">
              <thead className="border-b bg-muted/40 uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Name</th>
                  <th className="w-20 px-2 py-1.5 text-left font-medium">Start</th>
                  <th className="w-20 px-2 py-1.5 text-left font-medium">Bits</th>
                  <th className="w-10 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const active = hoveredField === field.name || activeField === field.name;
                  return (
                    <tr
                      key={`${field.name}-${index}`}
                      className={`border-b border-border/60 last:border-0 hover:bg-muted/30 ${active ? "bg-primary/5" : ""}`}
                      onMouseEnter={() => setHoveredField(field.name)}
                      onMouseLeave={() => setHoveredField(null)}
                    >
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring"
                          value={field.name}
                          disabled={!editable}
                          onFocus={() => setActiveField(field.name)}
                          onBlur={() => setActiveField(null)}
                          onChange={(event) => updateField(index, { name: event.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring"
                          type="number"
                          value={field.startBit}
                          disabled={!editable}
                          onFocus={() => setActiveField(field.name)}
                          onBlur={() => setActiveField(null)}
                          onChange={(event) => updateField(index, { startBit: Number(event.target.value) })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring"
                          type="number"
                          value={field.length}
                          disabled={!editable}
                          onFocus={() => setActiveField(field.name)}
                          onBlur={() => setActiveField(null)}
                          onChange={(event) => updateField(index, { length: Number(event.target.value) })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!editable} onClick={() => deleteField(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
