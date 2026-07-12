import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RangeGridEditor } from "@/profile-editor/bit-strip/RangeGridEditor";
import { DecodedPreviewPanel } from "@/profile-editor/DecodedPreviewPanel";
import { decodeFrameWithProfile } from "@/profile-editor/decodeProfile";
import type { CanProfile, CompactProfileAttributeDef, CompactProfileOperationDef, PayloadFieldDef } from "@/profile-editor/model/profile";
import { ProfileCanIdLayoutEditor } from "@/profile-editor/ProfileCanIdLayoutEditor";
import { getProfileMessageSchema } from "@/profile-editor/profileAdapter";
import { resolveProfileReferences, useProfileStore } from "@/profile-editor/store/profileStore";
import { Binary, Braces, Cable, ChevronRight, GitBranch, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type VariantKey = "command" | "response" | "event";

type ProfileNode =
  | { kind: "can-id" }
  | { kind: "service" }
  | { kind: "payload-header" }
  | { kind: "attribute"; attributeIndex: number }
  | { kind: "operation"; attributeIndex: number; operationIndex: number }
  | { kind: "variant"; attributeIndex: number; operationIndex: number; variant: VariantKey };

const variantLabels: Record<VariantKey, string> = {
  command: "Command",
  response: "Response",
  event: "Event",
};

const variantCommandClass: Record<VariantKey, number> = {
  command: 6,
  response: 5,
  event: 3,
};

function cleanHex(hex: string) {
  return hex.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}

function hexToBytes(hex: string) {
  const cleaned = cleanHex(hex);
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(Number.parseInt(cleaned.slice(i, i + 2).padEnd(2, "0"), 16));
  }
  return bytes;
}

function getBit(bytes: number[], bitIndex: number) {
  const byteIndex = Math.floor(bitIndex / 8);
  const bitInByte = bitIndex % 8;
  return ((bytes[byteIndex] ?? 0) >> bitInByte) & 1;
}

function fieldStartBit(field: PayloadFieldDef) {
  return field.byte != null ? field.byte * 8 + field.startBit : field.startBit;
}

function fieldBitLength(field: PayloadFieldDef) {
  return field.length;
}

function buildCanIdFromFields(fields: { name: string; startBit: number; length: number }[], values: Record<string, number>) {
  return fields.reduce((id, field) => {
    const value = values[field.name] ?? 0;
    const mask = field.length >= 32 ? 0xffffffff : 2 ** field.length - 1;
    return id + (Math.floor(value) & mask) * 2 ** field.startBit;
  }, 0);
}

function nodeKey(node: ProfileNode) {
  if (node.kind === "can-id" || node.kind === "service" || node.kind === "payload-header") return node.kind;
  if (node.kind === "attribute") return `attribute:${node.attributeIndex}`;
  if (node.kind === "operation") return `operation:${node.attributeIndex}:${node.operationIndex}`;
  return `variant:${node.attributeIndex}:${node.operationIndex}:${node.variant}`;
}

function nodeMatches(text: string, ...parts: Array<string | number | undefined>) {
  if (!text) return true;
  return parts
    .filter((part) => part != null)
    .join(" ")
    .toLowerCase()
    .includes(text);
}

function firstVariantNode(profile: CanProfile | null | undefined): ProfileNode {
  const attributes = profile?.attributes ?? [];
  for (let attributeIndex = 0; attributeIndex < attributes.length; attributeIndex++) {
    const operations = attributes[attributeIndex].operations ?? [];
    for (let operationIndex = 0; operationIndex < operations.length; operationIndex++) {
      const variants = operations[operationIndex].variants ?? {};
      for (const variant of ["command", "response", "event"] as VariantKey[]) {
        if (variant in variants) return { kind: "variant", attributeIndex, operationIndex, variant };
      }
    }
  }
  return profile?.service ? { kind: "service" } : { kind: "can-id" };
}

function selectedAttribute(profile: CanProfile | null | undefined, node: ProfileNode) {
  if (node.kind !== "attribute" && node.kind !== "operation" && node.kind !== "variant") return undefined;
  return profile?.attributes?.[node.attributeIndex];
}

function selectedOperation(profile: CanProfile | null | undefined, node: ProfileNode) {
  if (node.kind !== "operation" && node.kind !== "variant") return undefined;
  return profile?.attributes?.[node.attributeIndex]?.operations?.[node.operationIndex];
}

function selectedVariantFields(profile: CanProfile | null | undefined, node: ProfileNode) {
  if (node.kind !== "variant") return undefined;
  return profile?.attributes?.[node.attributeIndex]?.operations?.[node.operationIndex]?.variants?.[node.variant];
}

function ensureCompactProfile(draft: CanProfile) {
  draft.protocol ??= "schema";
  draft.service ??= { name: draft.meta.name ?? "service", identifier: 0 };
  draft.payloadHeader ??= { lengthBytes: 2, fields: [] };
  draft.attributes ??= [];
}

function definitionTitle(profile: CanProfile, node: ProfileNode) {
  if (node.kind === "can-id") return "CAN ID layout";
  if (node.kind === "service") return profile.service?.name ?? "Service";
  if (node.kind === "payload-header") return "Payload header";
  const attribute = selectedAttribute(profile, node);
  const operation = selectedOperation(profile, node);
  if (node.kind === "attribute") return attribute?.name ?? "Attribute";
  if (node.kind === "operation") return operation?.type ?? "Operation";
  return `${attribute?.name ?? "Attribute"} / ${operation?.type ?? "Operation"} / ${variantLabels[node.variant]}`;
}

function definitionNote(node: ProfileNode) {
  if (node.kind === "can-id") return "Universal arbitration ID fields used before message matching.";
  if (node.kind === "service") return "Profile-level service identity and byte order.";
  if (node.kind === "payload-header") return "Shared payload header fields decoded for every matching frame.";
  if (node.kind === "attribute") return "Attribute identity and operation list.";
  if (node.kind === "operation") return "Feature index, operation name, and available direction variants.";
  return "Payload fields for the selected message direction.";
}

export function ProfileMessageEditor() {
  const rawProfile = useProfileStore((s) => s.profile);
  const rawDraftProfile = useProfileStore((s) => s.draftProfile);
  const loadedProfileLibrary = useProfileStore((s) => s.loadedProfiles);
  const selectedFramePayloadHex = useProfileStore((s) => s.selectedFramePayloadHex);
  const updateDraftProfile = useProfileStore((s) => s.updateDraftProfile);
  const profile = useMemo(() => resolveProfileReferences(rawProfile, loadedProfileLibrary), [rawProfile, loadedProfileLibrary]);
  const draftProfile = useMemo(() => resolveProfileReferences(rawDraftProfile, loadedProfileLibrary), [rawDraftProfile, loadedProfileLibrary]);
  const activeProfile = draftProfile ?? profile;
  const editable = Boolean(draftProfile);
  const [selectedNode, setSelectedNode] = useState<ProfileNode>(() => firstVariantNode(activeProfile));
  const [search, setSearch] = useState("");
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);
  const normalizedSearch = search.trim().toLowerCase();
  const bytes = useMemo(() => hexToBytes(selectedFramePayloadHex ?? ""), [selectedFramePayloadHex]);

  const schema = useMemo(() => getProfileMessageSchema(activeProfile), [activeProfile]);
  const selectedAttr = selectedAttribute(activeProfile, selectedNode);
  const selectedOp = selectedOperation(activeProfile, selectedNode);
  const selectedFields = selectedNode.kind === "payload-header" ? activeProfile?.payloadHeader?.fields : selectedVariantFields(activeProfile, selectedNode);
  const compactAvailable = Boolean(activeProfile?.service || activeProfile?.payloadHeader || activeProfile?.attributes);

  useEffect(() => {
    if (activeProfile && !compactAvailable && selectedNode.kind !== "can-id") {
      setSelectedNode({ kind: "can-id" });
    }
  }, [activeProfile, compactAvailable, selectedNode.kind]);

  const decodedPreview = useMemo(() => {
    if (!activeProfile) return null;
    const canIdLayout =
      schema?.canIdLayout ??
      (activeProfile.defaultCanIdLayoutId
        ? activeProfile.canIdLayouts?.[activeProfile.defaultCanIdLayoutId]
        : Object.values(activeProfile.canIdLayouts ?? {})[0]);
    if (!canIdLayout) return null;

    const canId =
      selectedNode.kind === "variant" && activeProfile.service && selectedAttr && selectedOp
        ? buildCanIdFromFields(canIdLayout.fields, {
            service_identifier: activeProfile.service.identifier,
            command_class: variantCommandClass[selectedNode.variant],
          })
        : buildCanIdFromFields(canIdLayout.fields, {
            service_identifier: activeProfile.service?.identifier ?? 0,
          });

    return decodeFrameWithProfile(activeProfile, {
      type: "frame",
      id: canId,
      data_hex: selectedFramePayloadHex ?? "",
      iface: "",
      ts_ms: Date.now(),
      dir: "rx",
      is_fd: bytes.length > 8,
    });
  }, [activeProfile, bytes.length, schema?.canIdLayout, selectedAttr, selectedFramePayloadHex, selectedNode, selectedOp]);

  if (!activeProfile) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Load a profile JSON to edit it.</div>;
  }

  const currentProfile = activeProfile;

  function updateProfile(updater: (draft: CanProfile) => void) {
    updateDraftProfile((draft) => {
      ensureCompactProfile(draft);
      updater(draft);
    });
  }

  function updateService(patch: Partial<NonNullable<CanProfile["service"]>>) {
    updateProfile((draft) => {
      Object.assign(draft.service!, patch);
    });
  }

  function updatePayloadHeader(patch: Partial<NonNullable<CanProfile["payloadHeader"]>>) {
    updateProfile((draft) => {
      Object.assign(draft.payloadHeader!, patch);
    });
  }

  function updateAttribute(index: number, patch: Partial<CompactProfileAttributeDef>) {
    updateProfile((draft) => {
      if (!draft.attributes?.[index]) return;
      Object.assign(draft.attributes[index], patch);
    });
  }

  function updateOperation(attributeIndex: number, operationIndex: number, patch: Partial<CompactProfileOperationDef>) {
    updateProfile((draft) => {
      const operation = draft.attributes?.[attributeIndex]?.operations?.[operationIndex];
      if (!operation) return;
      Object.assign(operation, patch);
    });
  }

  function updateField(index: number, patch: Partial<PayloadFieldDef>) {
    updateProfile((draft) => {
      const fields =
        selectedNode.kind === "payload-header"
          ? draft.payloadHeader?.fields
          : selectedNode.kind === "variant"
            ? draft.attributes?.[selectedNode.attributeIndex]?.operations?.[selectedNode.operationIndex]?.variants?.[selectedNode.variant]
            : undefined;
      const field = fields?.[index];
      if (!field || !fields) return;
      const startBit = patch.startBit ?? field.startBit;
      const absoluteStart = patch.byte != null ? patch.byte * 8 + startBit : startBit;
      fields[index] = {
        ...field,
        ...patch,
        byte: Math.floor(absoluteStart / 8),
        startBit: absoluteStart % 8,
      };
    });
  }

  function addAttribute() {
    updateProfile((draft) => {
      const index = draft.attributes!.length;
      draft.attributes!.push({
        name: `attribute_${index + 1}`,
        address: index,
        operations: [
          {
            type: "get_current_value",
            featureIndex: 1,
            variants: {
              command: [],
              response: [],
            },
          },
        ],
      });
      setSelectedNode({ kind: "attribute", attributeIndex: index });
    });
  }

  function addOperation(attributeIndex: number) {
    updateProfile((draft) => {
      const operations = draft.attributes?.[attributeIndex]?.operations;
      if (!operations) return;
      const index = operations.length;
      operations.push({
        type: "operation",
        featureIndex: index + 1,
        variants: { command: [] },
      });
      setSelectedNode({ kind: "operation", attributeIndex, operationIndex: index });
    });
  }

  function addVariant(attributeIndex: number, operationIndex: number, variant: VariantKey) {
    updateProfile((draft) => {
      const variants = draft.attributes?.[attributeIndex]?.operations?.[operationIndex]?.variants;
      if (!variants) return;
      variants[variant] ??= [];
      setSelectedNode({ kind: "variant", attributeIndex, operationIndex, variant });
    });
  }

  function addField() {
    updateProfile((draft) => {
      let fields: PayloadFieldDef[] | undefined;
      if (selectedNode.kind === "payload-header") {
        draft.payloadHeader ??= { lengthBytes: 2, fields: [] };
        draft.payloadHeader.fields ??= [];
        fields = draft.payloadHeader.fields;
      } else if (selectedNode.kind === "variant") {
        const operation = draft.attributes?.[selectedNode.attributeIndex]?.operations?.[selectedNode.operationIndex];
        if (!operation) return;
        operation.variants ??= {};
        operation.variants[selectedNode.variant] ??= [];
        fields = operation.variants[selectedNode.variant];
      }
      if (!fields) return;
      fields.push({
        name: `field_${fields.length + 1}`,
        byte: selectedNode.kind === "payload-header" ? 0 : 2,
        startBit: 0,
        length: 8,
        type: "uint",
      });
    });
  }

  function deleteField(index: number) {
    updateProfile((draft) => {
      const fields =
        selectedNode.kind === "payload-header"
          ? draft.payloadHeader?.fields
          : selectedNode.kind === "variant"
            ? draft.attributes?.[selectedNode.attributeIndex]?.operations?.[selectedNode.operationIndex]?.variants?.[selectedNode.variant]
            : undefined;
      fields?.splice(index, 1);
    });
  }

  function renderOutline() {
    const attributes = currentProfile.attributes ?? [];
    return (
      <Card className="flex min-h-0 w-[320px] min-w-[240px] max-w-[560px] resize-x flex-col overflow-hidden rounded-lg shadow-sm">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Profile outline</CardTitle>
            <Button size="sm" variant="outline" onClick={addAttribute} disabled={!editable}>
              <Plus className="h-4 w-4" />
              Attribute
            </Button>
          </div>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="h-8 pl-8 text-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search profile" />
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 pt-0">
          <OutlineButton node={{ kind: "can-id" }} icon={<Binary className="h-4 w-4" />} title="CAN ID layout" detail={currentProfile.canIdLayoutRef ?? currentProfile.defaultCanIdLayoutId ?? "layout"} />
          {compactAvailable && (
            <>
              <OutlineButton node={{ kind: "service" }} icon={<Cable className="h-4 w-4" />} title={currentProfile.service?.name ?? "Service"} detail={`SID ${currentProfile.service?.identifier ?? 0}`} />
              <OutlineButton node={{ kind: "payload-header" }} icon={<Braces className="h-4 w-4" />} title="Payload header" detail={`${currentProfile.payloadHeader?.fields?.length ?? 0} fields`} />
              {attributes.map((attribute, attributeIndex) => {
                if (!nodeMatches(normalizedSearch, attribute.name, attribute.address)) return null;
                return (
                  <div key={`${attribute.name}-${attributeIndex}`} className="space-y-1">
                    <OutlineButton
                      node={{ kind: "attribute", attributeIndex }}
                      icon={<GitBranch className="h-4 w-4" />}
                      title={attribute.name}
                      detail={`address ${attribute.address}`}
                    />
                    <div className="ml-4 space-y-1 border-l pl-2">
                      {(attribute.operations ?? []).map((operation, operationIndex) => (
                        <div key={`${operation.type}-${operationIndex}`} className="space-y-1">
                          <OutlineButton
                            node={{ kind: "operation", attributeIndex, operationIndex }}
                            icon={<Settings2 className="h-4 w-4" />}
                            title={operation.type}
                            detail={`feature ${operation.featureIndex}`}
                          />
                          <div className="ml-4 flex flex-wrap gap-1">
                            {(["command", "response", "event"] as VariantKey[]).map((variant) =>
                              variant in (operation.variants ?? {}) ? (
                                <button
                                  key={variant}
                                  type="button"
                                  onClick={() => setSelectedNode({ kind: "variant", attributeIndex, operationIndex, variant })}
                                  className={`rounded border px-2 py-1 text-[11px] hover:bg-muted ${
                                    nodeKey(selectedNode) === nodeKey({ kind: "variant", attributeIndex, operationIndex, variant }) ? "border-primary bg-muted" : ""
                                  }`}
                                >
                                  {variantLabels[variant]} ({operation.variants?.[variant]?.length ?? 0})
                                </button>
                              ) : null,
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  function OutlineButton(props: { node: ProfileNode; icon: React.ReactNode; title: string; detail?: string }) {
    const active = nodeKey(selectedNode) === nodeKey(props.node);
    return (
      <button
        type="button"
        onClick={() => setSelectedNode(props.node)}
        className={`w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted ${active ? "border-primary bg-muted" : "border-border"}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {props.icon}
          <div className="min-w-0 flex-1 truncate font-medium">{props.title}</div>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </div>
        {props.detail && <div className="mt-0.5 truncate pl-6 text-xs text-muted-foreground">{props.detail}</div>}
      </button>
    );
  }

  function renderFieldLayout(fields: PayloadFieldDef[] | undefined, title: string, note: string) {
    const currentFields = fields ?? [];
    const maxFieldEnd = currentFields.reduce((max, field) => Math.max(max, fieldStartBit(field) + fieldBitLength(field)), 0);
    const payloadBits = Math.max(bytes.length * 8, maxFieldEnd, selectedNode.kind === "payload-header" ? 16 : 64);

    return (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{note}</div>
          </div>
          <Button size="sm" onClick={addField} disabled={!editable || (selectedNode.kind !== "payload-header" && selectedNode.kind !== "variant")}>
            <Plus className="h-4 w-4" />
            Field
          </Button>
        </div>
        <RangeGridEditor
          length={payloadBits}
          editable={editable}
          items={currentFields.map((field) => ({
            id: field.name,
            start: fieldStartBit(field),
            length: fieldBitLength(field),
            label: field.name,
          }))}
          activeItemId={activeField}
          hoverItemId={hoveredField}
          onHoverItem={setHoveredField}
          unitLabel={(index) => `${Math.floor(index / 8)}.${index % 8}`}
          valueLabel={(index) => getBit(bytes, index)}
          onChange={(name, start, length) => {
            const index = currentFields.findIndex((field) => field.name === name);
            if (index >= 0) updateField(index, { byte: Math.floor(start / 8), startBit: start % 8, length });
          }}
        />
        <div className="overflow-auto rounded-md bg-background">
          <table className="w-full table-auto text-xs">
            <thead className="border-b bg-muted/40 uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Name</th>
                <th className="w-20 px-2 py-1.5 text-left font-medium">Start</th>
                <th className="w-20 px-2 py-1.5 text-left font-medium">Bits</th>
                <th className="w-28 px-2 py-1.5 text-left font-medium">Type</th>
                <th className="w-24 px-2 py-1.5 text-left font-medium">Factor</th>
                <th className="w-24 px-2 py-1.5 text-left font-medium">Offset</th>
                <th className="w-24 px-2 py-1.5 text-left font-medium">Unit</th>
                <th className="w-56 px-2 py-1.5 text-left font-medium">Expression</th>
                <th className="w-10 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {currentFields.map((field, index) => {
                const start = fieldStartBit(field);
                const active = hoveredField === field.name || activeField === field.name;
                return (
                  <tr
                    key={`${field.name}-${index}`}
                    className={`border-b border-border/60 last:border-0 hover:bg-muted/30 ${active ? "bg-primary/5" : ""}`}
                    onMouseEnter={() => setHoveredField(field.name)}
                    onMouseLeave={() => setHoveredField(null)}
                  >
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" value={field.name} disabled={!editable} onFocus={() => setActiveField(field.name)} onBlur={() => setActiveField(null)} onChange={(event) => updateField(index, { name: event.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={start} disabled={!editable} onFocus={() => setActiveField(field.name)} onBlur={() => setActiveField(null)} onChange={(event) => updateField(index, { byte: Math.floor(Number(event.target.value) / 8), startBit: Number(event.target.value) % 8 })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={field.length} disabled={!editable} onFocus={() => setActiveField(field.name)} onBlur={() => setActiveField(null)} onChange={(event) => updateField(index, { length: Number(event.target.value) })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select value={field.type === "int" ? "int" : field.type === "bool" ? "bool" : "uint"} disabled={!editable} onValueChange={(value) => updateField(index, { type: value as PayloadFieldDef["type"] })}>
                        <SelectTrigger className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus:ring-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uint">Unsigned</SelectItem>
                          <SelectItem value="int">Signed</SelectItem>
                          <SelectItem value="bool">Bool</SelectItem>
                          <SelectItem value="enum">Enum</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={field.factor ?? 1} disabled={!editable} onChange={(event) => updateField(index, { factor: Number(event.target.value) })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={field.offset ?? 0} disabled={!editable} onChange={(event) => updateField(index, { offset: Number(event.target.value) })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" value={field.unit ?? ""} disabled={!editable} onChange={(event) => updateField(index, { unit: event.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent font-mono text-xs shadow-none hover:bg-background focus-visible:border-ring" value={field.expression ?? ""} disabled={!editable} placeholder='raw == 1 ? "On" : "Off"' onFocus={() => setActiveField(field.name)} onBlur={() => setActiveField(null)} onChange={(event) => updateField(index, { expression: event.target.value })} />
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
      </section>
    );
  }

  function renderDefinition() {
    if (selectedNode.kind === "can-id") return <ProfileCanIdLayoutEditor />;

    if (!compactAvailable) {
      return <div className="rounded-lg border p-4 text-sm text-muted-foreground">This editor expects the compact profile format.</div>;
    }

    if (selectedNode.kind === "service") {
      return (
        <section className="grid gap-3 rounded-lg border bg-background p-3 lg:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">
            Service name
            <Input value={currentProfile.service?.name ?? ""} disabled={!editable} onChange={(event) => updateService({ name: event.target.value })} />
          </label>
          <label className="space-y-1 text-xs font-medium">
            Service identifier
            <Input type="number" value={currentProfile.service?.identifier ?? 0} disabled={!editable} onChange={(event) => updateService({ identifier: Number(event.target.value) })} />
          </label>
          <label className="space-y-1 text-xs font-medium">
            Byte order
            <Select value={currentProfile.byteOrder ?? "little"} disabled={!editable} onValueChange={(value) => updateProfile((draft) => void (draft.byteOrder = value as "little" | "big"))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="little">Little endian</SelectItem>
                <SelectItem value="big">Big endian</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs font-medium">
            CAN ID layout ref
            <Input value={currentProfile.canIdLayoutRef ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.canIdLayoutRef = event.target.value))} />
          </label>
        </section>
      );
    }

    if (selectedNode.kind === "payload-header") {
      return (
        <div className="space-y-3">
          <section className="grid gap-3 rounded-lg border bg-background p-3 lg:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              Header length bytes
              <Input type="number" value={currentProfile.payloadHeader?.lengthBytes ?? 2} disabled={!editable} onChange={(event) => updatePayloadHeader({ lengthBytes: Number(event.target.value) })} />
            </label>
            <div className="flex items-end">
              <Badge variant="outline">{currentProfile.payloadHeader?.fields?.length ?? 0} fields</Badge>
            </div>
          </section>
          {renderFieldLayout(currentProfile.payloadHeader?.fields, "Payload header fields", "Decoded before selecting an attribute operation variant.")}
        </div>
      );
    }

    if (selectedNode.kind === "attribute") {
      const attribute = currentProfile.attributes?.[selectedNode.attributeIndex];
      return (
        <section className="space-y-3 rounded-lg border bg-background p-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              Attribute name
              <Input value={attribute?.name ?? ""} disabled={!editable} onChange={(event) => updateAttribute(selectedNode.attributeIndex, { name: event.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Attribute address
              <Input type="number" value={attribute?.address ?? 0} disabled={!editable} onChange={(event) => updateAttribute(selectedNode.attributeIndex, { address: Number(event.target.value) })} />
            </label>
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-xs text-muted-foreground">{attribute?.operations?.length ?? 0} operations</div>
            <Button size="sm" variant="outline" onClick={() => addOperation(selectedNode.attributeIndex)} disabled={!editable}>
              <Plus className="h-4 w-4" />
              Operation
            </Button>
          </div>
        </section>
      );
    }

    if (selectedNode.kind === "operation") {
      const operation = currentProfile.attributes?.[selectedNode.attributeIndex]?.operations?.[selectedNode.operationIndex];
      return (
        <section className="space-y-3 rounded-lg border bg-background p-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              Operation type
              <Input value={operation?.type ?? ""} disabled={!editable} onChange={(event) => updateOperation(selectedNode.attributeIndex, selectedNode.operationIndex, { type: event.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Feature index
              <Input type="number" value={operation?.featureIndex ?? 0} disabled={!editable} onChange={(event) => updateOperation(selectedNode.attributeIndex, selectedNode.operationIndex, { featureIndex: Number(event.target.value) })} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {(["command", "response", "event"] as VariantKey[]).map((variant) => (
              <Button key={variant} size="sm" variant={variant in (operation?.variants ?? {}) ? "default" : "outline"} disabled={!editable && !(variant in (operation?.variants ?? {}))} onClick={() => addVariant(selectedNode.attributeIndex, selectedNode.operationIndex, variant)}>
                {variant in (operation?.variants ?? {}) ? "Open" : "Add"} {variantLabels[variant]}
              </Button>
            ))}
          </div>
        </section>
      );
    }

    const attribute = selectedAttr;
    const operation = selectedOp;
    return (
      <div className="space-y-3">
        <section className="grid gap-3 rounded-lg border bg-background p-3 lg:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Attribute</div>
            <div className="text-sm font-medium">{attribute?.name}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Address</div>
            <div className="text-sm font-medium">{attribute?.address}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Operation</div>
            <div className="text-sm font-medium">{operation?.type}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Variant</div>
            <div className="text-sm font-medium">{variantLabels[selectedNode.variant]}</div>
          </div>
        </section>
        {renderFieldLayout(selectedFields, `${variantLabels[selectedNode.variant]} payload fields`, "Message-specific payload values for the selected operation variant.")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-4 overflow-hidden">
      {renderOutline()}
      <Card className="flex min-h-0 min-w-[380px] flex-1 flex-col rounded-lg shadow-sm">
        <CardHeader className="border-b p-4 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">Definition editor</div>
              <CardTitle className="mt-1 text-sm">{definitionTitle(currentProfile, selectedNode)}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{definitionNote(selectedNode)}</p>
            </div>
            {!editable && <Badge variant="outline">Read only</Badge>}
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-4 pb-8">
          {renderDefinition()}
        </CardContent>
      </Card>
      <Card className="flex min-h-0 w-[360px] min-w-[300px] flex-col rounded-lg shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Decoded preview</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-4 overflow-auto p-4 pt-0">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Selected payload</div>
            <div className="mt-1 break-all font-mono text-sm">{selectedFramePayloadHex || "No trace payload selected"}</div>
          </div>
          <DecodedPreviewPanel decoded={decodedPreview} />
        </CardContent>
      </Card>
    </div>
  );
}
