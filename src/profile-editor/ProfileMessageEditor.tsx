import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RangeGridEditor } from "@/profile-editor/bit-strip/RangeGridEditor";
import { DecodedPreviewPanel } from "@/profile-editor/DecodedPreviewPanel";
import { decodeFrameWithProfile } from "@/profile-editor/decodeProfile";
import type { CanProfile, CompactProfileAttributeDef, CompactProfileOperationDef, PayloadFieldDef, SignalDef } from "@/profile-editor/model/profile";
import { ProfileCanIdLayoutEditor } from "@/profile-editor/ProfileCanIdLayoutEditor";
import { getProfileMessageSchema } from "@/profile-editor/profileAdapter";
import { resolveProfileReferences, useProfileStore } from "@/profile-editor/store/profileStore";
import { useAppStore } from "@/store/appShellStore";
import { Binary, Braces, Cable, ChevronDown, ChevronRight, GitBranch, HelpCircle, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type VariantKey = "command" | "response" | "event";

type ProfileNode =
  | { kind: "can-id" }
  | { kind: "service" }
  | { kind: "payload-header" }
  | { kind: "schema-payload-header" }
  | { kind: "schema-message"; messageIndex: number }
  | { kind: "frame"; frameKey: string }
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

function signalStartBit(signal: SignalDef) {
  return signal.startByte * 8 + (signal.startBit ?? 0);
}

function signalBitLength(signal: SignalDef) {
  return signal.bitLength ?? signal.length * 8;
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
  if (node.kind === "schema-payload-header") return "schema-payload-header";
  if (node.kind === "schema-message") return `schema-message:${node.messageIndex}`;
  if (node.kind === "frame") return `frame:${node.frameKey}`;
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
  if (profile?.messageSchema?.messageDefinitions?.length) return { kind: "schema-message", messageIndex: 0 };
  const firstFrameKey = Object.keys(profile?.frames ?? {})[0];
  if (firstFrameKey) return { kind: "frame", frameKey: firstFrameKey };
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
  if (node.kind === "schema-payload-header") return profile.messageSchema?.payloadHeader?.label ?? "Payload header";
  if (node.kind === "schema-message") {
    const message = profile.messageSchema?.messageDefinitions?.[node.messageIndex];
    return message?.label ?? message?.name ?? message?.id ?? "Message definition";
  }
  if (node.kind === "frame") return profile.frames?.[node.frameKey]?.label ?? node.frameKey;
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
  if (node.kind === "schema-payload-header") return "Shared schema header decoded before selecting a message definition.";
  if (node.kind === "schema-message") return "Message match criteria and payload fields from the loaded schema profile.";
  if (node.kind === "frame") return "Exact CAN ID frame definition and payload signals.";
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
  const setView = useAppStore((s) => s.setView);
  const profile = useMemo(() => resolveProfileReferences(rawProfile, loadedProfileLibrary), [rawProfile, loadedProfileLibrary]);
  const draftProfile = useMemo(() => resolveProfileReferences(rawDraftProfile, loadedProfileLibrary), [rawDraftProfile, loadedProfileLibrary]);
  const activeProfile = draftProfile ?? profile;
  const editable = Boolean(draftProfile);
  const [selectedNode, setSelectedNode] = useState<ProfileNode>(() => firstVariantNode(activeProfile));
  const [search, setSearch] = useState("");
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [expandedAttributes, setExpandedAttributes] = useState<Record<number, boolean>>({});
  const normalizedSearch = search.trim().toLowerCase();
  const bytes = useMemo(() => hexToBytes(selectedFramePayloadHex ?? ""), [selectedFramePayloadHex]);

  const schema = useMemo(() => getProfileMessageSchema(activeProfile), [activeProfile]);
  const selectedAttr = selectedAttribute(activeProfile, selectedNode);
  const selectedOp = selectedOperation(activeProfile, selectedNode);
  const selectedFields =
    selectedNode.kind === "payload-header"
      ? activeProfile?.payloadHeader?.fields
      : selectedNode.kind === "schema-payload-header"
        ? activeProfile?.messageSchema?.payloadHeader?.fields
        : selectedNode.kind === "schema-message"
          ? activeProfile?.messageSchema?.messageDefinitions?.[selectedNode.messageIndex]?.payloadFields
          : selectedVariantFields(activeProfile, selectedNode);
  const compactAvailable = Boolean(activeProfile?.service || activeProfile?.payloadHeader || activeProfile?.attributes);
  const schemaAvailable = Boolean(activeProfile?.messageSchema);
  const frameEntries = useMemo(() => Object.entries(activeProfile?.frames ?? {}), [activeProfile?.frames]);

  useEffect(() => {
    if (!activeProfile) return;
    const valid =
      selectedNode.kind === "can-id" ||
      (compactAvailable && ["service", "payload-header", "attribute", "operation", "variant"].includes(selectedNode.kind)) ||
      (schemaAvailable && selectedNode.kind === "schema-payload-header") ||
      (schemaAvailable && selectedNode.kind === "schema-message" && Boolean(activeProfile.messageSchema?.messageDefinitions?.[selectedNode.messageIndex])) ||
      (selectedNode.kind === "frame" && Boolean(activeProfile.frames?.[selectedNode.frameKey]));
    if (!valid) {
      setSelectedNode(firstVariantNode(activeProfile));
    }
  }, [activeProfile, compactAvailable, schemaAvailable, selectedNode]);

  const decodedPreview = useMemo(() => {
    if (!activeProfile) return null;
    const canIdLayout =
      schema?.canIdLayout ??
      (activeProfile.defaultCanIdLayoutId
        ? activeProfile.canIdLayouts?.[activeProfile.defaultCanIdLayoutId]
        : Object.values(activeProfile.canIdLayouts ?? {})[0]);
    if (!canIdLayout) return null;

    const canId =
      selectedNode.kind === "schema-message" && activeProfile.messageSchema?.messageDefinitions?.[selectedNode.messageIndex]
        ? buildCanIdFromFields(canIdLayout.fields, Object.fromEntries(Object.entries(activeProfile.messageSchema.messageDefinitions[selectedNode.messageIndex].match.canId ?? {}).map(([key, value]) => [key, Number(value) || 0])))
        : selectedNode.kind === "frame" && activeProfile.frames?.[selectedNode.frameKey]?.canId != null
          ? Number(activeProfile.frames[selectedNode.frameKey].canId)
          : selectedNode.kind === "variant" && activeProfile.service && selectedAttr && selectedOp
        ? buildCanIdFromFields(canIdLayout.fields, {
            service_identifier: activeProfile.service.identifier,
            command_class: variantCommandClass[selectedNode.variant],
          })
        : buildCanIdFromFields(canIdLayout.fields, {
            service_identifier: activeProfile.service?.identifier ?? 0,
            command_class: 6,
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
    updateDraftProfile(updater);
  }

  function updateCompactProfile(updater: (draft: CanProfile) => void) {
    updateDraftProfile((draft) => {
      ensureCompactProfile(draft);
      updater(draft);
    });
  }

  function openHelp(sectionId: string) {
    window.location.hash = sectionId;
    setView("help");
    window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function updateService(patch: Partial<NonNullable<CanProfile["service"]>>) {
    updateCompactProfile((draft) => {
      Object.assign(draft.service!, patch);
    });
  }

  function updatePayloadHeader(patch: Partial<NonNullable<CanProfile["payloadHeader"]>>) {
    updateCompactProfile((draft) => {
      Object.assign(draft.payloadHeader!, patch);
    });
  }

  function updateAttribute(index: number, patch: Partial<CompactProfileAttributeDef>) {
    updateCompactProfile((draft) => {
      if (!draft.attributes?.[index]) return;
      Object.assign(draft.attributes[index], patch);
    });
  }

  function updateOperation(attributeIndex: number, operationIndex: number, patch: Partial<CompactProfileOperationDef>) {
    updateCompactProfile((draft) => {
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
          : selectedNode.kind === "schema-payload-header"
            ? draft.messageSchema?.payloadHeader?.fields
            : selectedNode.kind === "schema-message"
              ? draft.messageSchema?.messageDefinitions?.[selectedNode.messageIndex]?.payloadFields
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
    updateCompactProfile((draft) => {
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
    updateCompactProfile((draft) => {
      const attribute = draft.attributes?.[attributeIndex];
      if (!attribute) return;
      attribute.operations ??= [];
      const operations = attribute.operations;
      if (!operations) return;
      const index = operations.length;
      operations.push({
        type: "operation",
        featureIndex: index + 1,
        variants: { command: [] },
      });
      setSelectedNode({ kind: "operation", attributeIndex, operationIndex: index });
      setExpandedAttributes((state) => ({ ...state, [attributeIndex]: true }));
    });
  }

  function addVariant(attributeIndex: number, operationIndex: number, variant: VariantKey) {
    updateCompactProfile((draft) => {
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
      } else if (selectedNode.kind === "schema-payload-header") {
        draft.messageSchema ??= { messageDefinitions: [] };
        draft.messageSchema.payloadHeader ??= { lengthBytes: 2, fields: [] };
        fields = draft.messageSchema.payloadHeader.fields;
      } else if (selectedNode.kind === "schema-message") {
        fields = draft.messageSchema?.messageDefinitions?.[selectedNode.messageIndex]?.payloadFields;
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
        byte: selectedNode.kind === "payload-header" || selectedNode.kind === "schema-payload-header" ? 0 : 2,
        startBit: 0,
        length: 8,
        type: "uint",
      });
      if (selectedNode.kind === "variant") {
        setExpandedAttributes((state) => ({ ...state, [selectedNode.attributeIndex]: true }));
      }
    });
  }

  function deleteField(index: number) {
    updateProfile((draft) => {
      const fields =
        selectedNode.kind === "payload-header"
          ? draft.payloadHeader?.fields
          : selectedNode.kind === "schema-payload-header"
            ? draft.messageSchema?.payloadHeader?.fields
            : selectedNode.kind === "schema-message"
              ? draft.messageSchema?.messageDefinitions?.[selectedNode.messageIndex]?.payloadFields
          : selectedNode.kind === "variant"
            ? draft.attributes?.[selectedNode.attributeIndex]?.operations?.[selectedNode.operationIndex]?.variants?.[selectedNode.variant]
            : undefined;
      fields?.splice(index, 1);
    });
  }

  function updateSignal(index: number, patch: Partial<SignalDef>) {
    if (selectedNode.kind !== "frame") return;
    updateProfile((draft) => {
      const signal = draft.frames?.[selectedNode.frameKey]?.signals?.[index];
      if (!signal) return;
      Object.assign(signal, patch);
    });
  }

  function addSignal() {
    if (selectedNode.kind !== "frame") return;
    updateProfile((draft) => {
      const frame = draft.frames?.[selectedNode.frameKey];
      if (!frame) return;
      frame.signals ??= [];
      frame.signals.push({
        name: `signal_${frame.signals.length + 1}`,
        startByte: 0,
        startBit: 0,
        length: 1,
        bitLength: 8,
      });
    });
  }

  function deleteSignal(index: number) {
    if (selectedNode.kind !== "frame") return;
    updateProfile((draft) => {
      draft.frames?.[selectedNode.frameKey]?.signals?.splice(index, 1);
    });
  }

  function renderOutline() {
    const attributes = currentProfile.attributes ?? [];
    const schemaMessages = currentProfile.messageSchema?.messageDefinitions ?? [];
    return (
      <Card className="flex min-h-0 w-[320px] min-w-[240px] max-w-[560px] resize-x flex-col overflow-hidden rounded-lg shadow-sm">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Profile outline</CardTitle>
            <Button size="sm" variant="outline" onClick={addAttribute} disabled={!editable || !compactAvailable}>
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
          {schemaAvailable && (
            <>
              <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Schema messages</div>
              {currentProfile.messageSchema?.payloadHeader && (
                <OutlineButton node={{ kind: "schema-payload-header" }} icon={<Braces className="h-4 w-4" />} title={currentProfile.messageSchema.payloadHeader.label ?? "Payload header"} detail={`${currentProfile.messageSchema.payloadHeader.fields?.length ?? 0} fields`} />
              )}
              {schemaMessages.map((message, messageIndex) => {
                if (!nodeMatches(normalizedSearch, message.label, message.name, message.id, message.meaning, message.serviceName, message.attributeName, message.featureName)) return null;
                return (
                  <OutlineButton
                    key={`${message.id ?? message.name ?? "schema-message"}-${messageIndex}`}
                    node={{ kind: "schema-message", messageIndex }}
                    icon={<GitBranch className="h-4 w-4" />}
                    title={message.label ?? message.name ?? message.id ?? `Message ${messageIndex + 1}`}
                    detail={`${message.payloadFields?.length ?? 0} payload fields`}
                  />
                );
              })}
            </>
          )}
          {frameEntries.length > 0 && (
            <>
              <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Frames</div>
              {frameEntries.map(([frameKey, frame]) => {
                if (!nodeMatches(normalizedSearch, frameKey, frame.label, frame.note, frame.canIdLayout)) return null;
                return (
                  <OutlineButton
                    key={frameKey}
                    node={{ kind: "frame", frameKey }}
                    icon={<Cable className="h-4 w-4" />}
                    title={frame.label ?? frameKey}
                    detail={`${frame.signals?.length ?? 0} signals`}
                  />
                );
              })}
            </>
          )}
          {compactAvailable && (
            <>
              <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Compact profile</div>
              <OutlineButton node={{ kind: "service" }} icon={<Cable className="h-4 w-4" />} title={currentProfile.service?.name ?? "Service"} detail={`SID ${currentProfile.service?.identifier ?? 0}`} />
              <OutlineButton node={{ kind: "payload-header" }} icon={<Braces className="h-4 w-4" />} title="Payload header" detail={`${currentProfile.payloadHeader?.fields?.length ?? 0} fields`} />
              {attributes.map((attribute, attributeIndex) => {
                if (!nodeMatches(normalizedSearch, attribute.name, attribute.address)) return null;
                const expanded = normalizedSearch ? true : expandedAttributes[attributeIndex] ?? false;
                return (
                  <div key={`${attribute.name}-${attributeIndex}`} className="space-y-1">
                    <div className="flex items-stretch gap-1">
                      <button type="button"
                        className="rounded-md border px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={expanded ? "Collapse attribute" : "Expand attribute"}
                        onClick={() => setExpandedAttributes((state) => ({ ...state, [attributeIndex]: !expanded }))}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <OutlineButton
                          node={{ kind: "attribute", attributeIndex }}
                          icon={<GitBranch className="h-4 w-4" />}
                          title={attribute.name}
                          detail={`address ${attribute.address}`}
                        />
                      </div>
                    </div>
                    {expanded && (
                      <div className="ml-7 space-y-1 border-l pl-2">
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
                                  <button type="button"
                                    key={variant}
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
                    )}
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
      <button type="button"
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
          <Button size="sm" onClick={addField} disabled={!editable || !["payload-header", "schema-payload-header", "schema-message", "variant"].includes(selectedNode.kind)}>
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

  function renderSignalLayout(signals: SignalDef[] | undefined) {
    const currentSignals = signals ?? [];
    const maxSignalEnd = currentSignals.reduce((max, signal) => Math.max(max, signalStartBit(signal) + signalBitLength(signal)), 0);
    const payloadBits = Math.max(bytes.length * 8, maxSignalEnd, 64);

    return (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Payload signals</div>
            <div className="text-xs text-muted-foreground">Signals decoded for the exact CAN ID frame profile.</div>
          </div>
          <Button size="sm" onClick={addSignal} disabled={!editable || selectedNode.kind !== "frame"}>
            <Plus className="h-4 w-4" />
            Signal
          </Button>
        </div>
        <RangeGridEditor
          length={payloadBits}
          editable={editable}
          items={currentSignals.map((signal) => ({
            id: signal.name,
            start: signalStartBit(signal),
            length: signalBitLength(signal),
            label: signal.name,
          }))}
          activeItemId={activeField}
          hoverItemId={hoveredField}
          onHoverItem={setHoveredField}
          unitLabel={(index) => `${Math.floor(index / 8)}.${index % 8}`}
          valueLabel={(index) => getBit(bytes, index)}
          onChange={(name, start, length) => {
            const index = currentSignals.findIndex((signal) => signal.name === name);
            if (index >= 0) updateSignal(index, { startByte: Math.floor(start / 8), startBit: start % 8, bitLength: length, length: Math.max(1, Math.ceil(length / 8)) });
          }}
        />
        <div className="overflow-auto rounded-md bg-background">
          <table className="w-full table-auto text-xs">
            <thead className="border-b bg-muted/40 uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Name</th>
                <th className="w-20 px-2 py-1.5 text-left font-medium">Start</th>
                <th className="w-20 px-2 py-1.5 text-left font-medium">Bits</th>
                <th className="w-24 px-2 py-1.5 text-left font-medium">Signed</th>
                <th className="w-24 px-2 py-1.5 text-left font-medium">Factor</th>
                <th className="w-24 px-2 py-1.5 text-left font-medium">Offset</th>
                <th className="w-24 px-2 py-1.5 text-left font-medium">Unit</th>
                <th className="w-56 px-2 py-1.5 text-left font-medium">Expression</th>
                <th className="w-10 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {currentSignals.map((signal, index) => {
                const start = signalStartBit(signal);
                const active = hoveredField === signal.name || activeField === signal.name;
                return (
                  <tr
                    key={`${signal.name}-${index}`}
                    className={`border-b border-border/60 last:border-0 hover:bg-muted/30 ${active ? "bg-primary/5" : ""}`}
                    onMouseEnter={() => setHoveredField(signal.name)}
                    onMouseLeave={() => setHoveredField(null)}
                  >
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" value={signal.name} disabled={!editable} onFocus={() => setActiveField(signal.name)} onBlur={() => setActiveField(null)} onChange={(event) => updateSignal(index, { name: event.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={start} disabled={!editable} onFocus={() => setActiveField(signal.name)} onBlur={() => setActiveField(null)} onChange={(event) => updateSignal(index, { startByte: Math.floor(Number(event.target.value) / 8), startBit: Number(event.target.value) % 8 })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={signalBitLength(signal)} disabled={!editable} onFocus={() => setActiveField(signal.name)} onBlur={() => setActiveField(null)} onChange={(event) => updateSignal(index, { bitLength: Number(event.target.value), length: Math.max(1, Math.ceil(Number(event.target.value) / 8)) })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select value={signal.signed ? "signed" : "unsigned"} disabled={!editable} onValueChange={(value) => updateSignal(index, { signed: value === "signed" })}>
                        <SelectTrigger className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus:ring-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unsigned">Unsigned</SelectItem>
                          <SelectItem value="signed">Signed</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={signal.factor ?? 1} disabled={!editable} onChange={(event) => updateSignal(index, { factor: Number(event.target.value) })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={signal.offset ?? 0} disabled={!editable} onChange={(event) => updateSignal(index, { offset: Number(event.target.value) })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" value={signal.unit ?? ""} disabled={!editable} onChange={(event) => updateSignal(index, { unit: event.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 border-transparent bg-transparent font-mono text-xs shadow-none hover:bg-background focus-visible:border-ring" value={signal.expression ?? ""} disabled={!editable} placeholder="raw * 0.1" onFocus={() => setActiveField(signal.name)} onBlur={() => setActiveField(null)} onChange={(event) => updateSignal(index, { expression: event.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!editable} onClick={() => deleteSignal(index)}>
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

    if (selectedNode.kind === "schema-payload-header") {
      const header = currentProfile.messageSchema?.payloadHeader;
      return (
        <div className="space-y-3">
          <section className="grid gap-3 rounded-lg border bg-background p-3 lg:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              Label
              <Input value={header?.label ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.messageSchema!.payloadHeader!.label = event.target.value))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Header length bytes
              <Input type="number" value={header?.lengthBytes ?? 0} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.messageSchema!.payloadHeader!.lengthBytes = Number(event.target.value)))} />
            </label>
            <label className="space-y-1 text-xs font-medium lg:col-span-2">
              Note
              <Input value={header?.note ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.messageSchema!.payloadHeader!.note = event.target.value))} />
            </label>
          </section>
          {renderFieldLayout(header?.fields as PayloadFieldDef[] | undefined, "Payload header fields", "Shared decoded fields used before matching schema messages.")}
        </div>
      );
    }

    if (selectedNode.kind === "schema-message") {
      const message = currentProfile.messageSchema?.messageDefinitions?.[selectedNode.messageIndex];
      return (
        <div className="space-y-3">
          <section className="grid gap-3 rounded-lg border bg-background p-3 lg:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              Name
              <Input value={message?.name ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.messageSchema!.messageDefinitions[selectedNode.messageIndex].name = event.target.value))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Label
              <Input value={message?.label ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.messageSchema!.messageDefinitions[selectedNode.messageIndex].label = event.target.value))} />
            </label>
            <label className="space-y-1 text-xs font-medium lg:col-span-2">
              Meaning
              <Input value={message?.meaning ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.messageSchema!.messageDefinitions[selectedNode.messageIndex].meaning = event.target.value))} />
            </label>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-medium text-muted-foreground">CAN ID match</div>
              <pre className="mt-1 max-h-28 overflow-auto text-xs">{JSON.stringify(message?.match?.canId ?? {}, null, 2)}</pre>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-medium text-muted-foreground">Payload header match</div>
              <pre className="mt-1 max-h-28 overflow-auto text-xs">{JSON.stringify(message?.match?.payloadHeader ?? {}, null, 2)}</pre>
            </div>
          </section>
          {renderFieldLayout(message?.payloadFields, "Payload fields", "Fields decoded only when this message definition matches the frame.")}
        </div>
      );
    }

    if (selectedNode.kind === "frame") {
      const frame = currentProfile.frames?.[selectedNode.frameKey];
      return (
        <div className="space-y-3">
          <section className="grid gap-3 rounded-lg border bg-background p-3 lg:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              Frame key
              <Input value={selectedNode.frameKey} disabled />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Label
              <Input value={frame?.label ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.frames[selectedNode.frameKey].label = event.target.value))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              CAN ID
              <Input value={frame?.canId != null ? `0x${frame.canId.toString(16).toUpperCase()}` : frame?.canIdLayout ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.frames[selectedNode.frameKey].canIdLayout = event.target.value))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Payload length
              <Input type="number" value={frame?.payloadLength ?? 0} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.frames[selectedNode.frameKey].payloadLength = Number(event.target.value)))} />
            </label>
            <label className="space-y-1 text-xs font-medium lg:col-span-2">
              Note
              <Input value={frame?.note ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.frames[selectedNode.frameKey].note = event.target.value))} />
            </label>
          </section>
          {renderSignalLayout(frame?.signals)}
        </div>
      );
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
            <div className="flex items-center gap-2">
              {!editable && <Badge variant="outline">Read only</Badge>}
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Open profile editor help" onClick={() => openHelp("profile-editor")}>
                <HelpCircle className="h-4 w-4" />
              </Button>
            </div>
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


