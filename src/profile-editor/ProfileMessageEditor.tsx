import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DecodedPreviewPanel } from "@/profile-editor/DecodedPreviewPanel";
import { decodeFrameWithProfile } from "@/profile-editor/decodeProfile";
import type { CanonicalField, CanonicalMessage, CanonicalProfile } from "@/profile-editor/model/canonicalProfile";
import { resolveProfileReferences, useProfileStore } from "@/profile-editor/store/profileStore";
import { useAppStore } from "@/store/appShellStore";
import { Braces, BookOpenText, ChevronDown, ChevronRight, CircleAlert, Database, FileJson, HelpCircle, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ProfileNode =
  | { kind: "meta" }
  | { kind: "bus" }
  | { kind: "can-id" }
  | { kind: "payload-header" }
  | { kind: "dictionaries" }
  | { kind: "dictionary"; key: string }
  | { kind: "messages" }
  | { kind: "message"; messageId: string }
  | { kind: "errors" }
  | { kind: "error"; errorId: string }
  | { kind: "display" };

function nodeKey(node: ProfileNode) {
  if (node.kind === "dictionary") return `dictionary:${node.key}`;
  if (node.kind === "message") return `message:${node.messageId}`;
  if (node.kind === "error") return `error:${node.errorId}`;
  return node.kind;
}

function matchesSearch(text: string, ...parts: Array<string | number | undefined>) {
  if (!text) return true;
  return parts
    .filter((part) => part != null)
    .join(" ")
    .toLowerCase()
    .includes(text);
}

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

function buildIdentifier(fields: CanonicalField[], values: Record<string, unknown>) {
  if (typeof values.can_id === "number") return values.can_id;
  return fields.reduce((id, field) => {
    const raw = values[field.name];
    const value = typeof raw === "number" ? raw : Number(raw ?? 0);
    if (!Number.isFinite(value)) return id;
    const mask = field.bitLength >= 32 ? 0xffffffff : 2 ** field.bitLength - 1;
    return id + (Math.floor(value) & mask) * 2 ** field.startBit;
  }, 0);
}

function profileTitle(profile: CanonicalProfile, node: ProfileNode) {
  if (node.kind === "meta") return "Metadata";
  if (node.kind === "bus") return "Bus";
  if (node.kind === "can-id") return profile.layouts.canId.label ?? "CAN ID";
  if (node.kind === "payload-header") return profile.layouts.payloadHeader?.label ?? "Payload header";
  if (node.kind === "dictionaries") return "Dictionaries";
  if (node.kind === "dictionary") return node.key;
  if (node.kind === "messages") return "Messages";
  if (node.kind === "message") return profile.messages.find((message) => message.id === node.messageId)?.label ?? node.messageId;
  if (node.kind === "errors") return "Errors";
  if (node.kind === "error") return profile.errors?.find((error) => error.id === node.errorId)?.id ?? node.errorId;
  return "Display";
}

function profileNote(node: ProfileNode) {
  if (node.kind === "meta") return "Profile identity and source information.";
  if (node.kind === "bus") return "CAN bus format and default byte order.";
  if (node.kind === "can-id") return "Arbitration ID fields decoded before message identification.";
  if (node.kind === "payload-header") return "Shared payload fields decoded before message-specific payload values.";
  if (node.kind === "dictionaries" || node.kind === "dictionary") return "Numeric-to-text labels used by decoded fields.";
  if (node.kind === "messages" || node.kind === "message") return "Message identification criteria and decoded payload fields.";
  if (node.kind === "errors" || node.kind === "error") return "Error extraction rules used when a decoded frame indicates failure.";
  return "Optional column and presentation hints for the application.";
}

function createField(index: number, startBit = 0): CanonicalField {
  return {
    name: `field_${index + 1}`,
    startBit,
    bitLength: 8,
    type: "uint",
  };
}

function createMessage(index: number): CanonicalMessage {
  return {
    id: `message_${index + 1}`,
    label: `Message ${index + 1}`,
    identifyBy: {},
    payload: {
      bitLength: 0,
      fields: [],
    },
  };
}

export function ProfileMessageEditor() {
  const rawProfile = useProfileStore((s) => s.profile);
  const rawDraftProfile = useProfileStore((s) => s.draftProfile);
  const selectedMessageDefinitionId = useProfileStore((s) => s.selectedMessageDefinitionId);
  const selectedFramePayloadHex = useProfileStore((s) => s.selectedFramePayloadHex);
  const updateDraftProfile = useProfileStore((s) => s.updateDraftProfile);
  const setView = useAppStore((s) => s.setView);
  const profile = useMemo(() => {
    return resolveProfileReferences(rawProfile);
  }, [rawProfile]);
  const draftProfile = useMemo(() => {
    return resolveProfileReferences(rawDraftProfile);
  }, [rawDraftProfile]);
  const activeProfile = draftProfile ?? profile;
  const editable = Boolean(draftProfile);
  const [selectedNode, setSelectedNode] = useState<ProfileNode>({ kind: "messages" });
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ layouts: true, messages: true });

  useEffect(() => {
    if (selectedMessageDefinitionId) {
      setSelectedNode({ kind: "message", messageId: selectedMessageDefinitionId });
      setExpanded((state) => ({ ...state, messages: true }));
    }
  }, [selectedMessageDefinitionId]);

  useEffect(() => {
    if (!activeProfile) return;
    if (selectedNode.kind === "message" && !activeProfile.messages.some((message) => message.id === selectedNode.messageId)) {
      setSelectedNode(activeProfile.messages[0] ? { kind: "message", messageId: activeProfile.messages[0].id } : { kind: "messages" });
    }
    if (selectedNode.kind === "dictionary" && !activeProfile.dictionaries?.[selectedNode.key]) {
      setSelectedNode({ kind: "dictionaries" });
    }
    if (selectedNode.kind === "error" && !activeProfile.errors?.some((error) => error.id === selectedNode.errorId)) {
      setSelectedNode({ kind: "errors" });
    }
  }, [activeProfile, selectedNode]);

  const selectedMessage = activeProfile?.messages.find((message) => selectedNode.kind === "message" && message.id === selectedNode.messageId);
  const bytes = useMemo(() => hexToBytes(selectedFramePayloadHex ?? ""), [selectedFramePayloadHex]);

  const decodedPreview = useMemo(() => {
    if (!activeProfile) return null;
    const message = selectedMessage ?? activeProfile.messages[0];
    const id = buildIdentifier(activeProfile.layouts.canId.fields, message?.identifyBy ?? {});
    return decodeFrameWithProfile(activeProfile, {
      type: "frame",
      id,
      data_hex: selectedFramePayloadHex ?? "",
      iface: "",
      ts_ms: Date.now(),
      dir: "rx",
      is_fd: bytes.length > 8 || activeProfile.bus.type === "can-fd",
    });
  }, [activeProfile, bytes.length, selectedFramePayloadHex, selectedMessage]);

  if (!activeProfile) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Load a profile JSON to edit it.</div>;
  }
  const currentProfile = activeProfile;

  function updateProfile(updater: (draft: CanonicalProfile) => void) {
    updateDraftProfile((draft) => {
      if (!("schemaVersion" in draft)) return;
      updater(draft as unknown as CanonicalProfile);
    });
  }

  function openHelp(sectionId: string) {
    window.location.hash = sectionId;
    setView("help");
    window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function updateField(fields: CanonicalField[], index: number, patch: Partial<CanonicalField>) {
    fields[index] = { ...fields[index], ...patch };
  }

  function addCanIdField() {
    updateProfile((draft) => {
      draft.layouts.canId.fields.push(createField(draft.layouts.canId.fields.length));
    });
  }

  function addPayloadHeaderField() {
    updateProfile((draft) => {
      draft.layouts.payloadHeader ??= { label: "Payload header", bitLength: 0, fields: [] };
      draft.layouts.payloadHeader.fields.push(createField(draft.layouts.payloadHeader.fields.length));
    });
  }

  function addPayloadField(messageId: string) {
    updateProfile((draft) => {
      const message = draft.messages.find((item) => item.id === messageId);
      if (!message) return;
      message.payload.fields.push(createField(message.payload.fields.length));
      message.payload.bitLength = Math.max(message.payload.bitLength, 8);
    });
  }

  function addMessage() {
    updateProfile((draft) => {
      const message = createMessage(draft.messages.length);
      draft.messages.push(message);
      setSelectedNode({ kind: "message", messageId: message.id });
      setExpanded((state) => ({ ...state, messages: true }));
    });
  }

  function deleteMessage(messageId: string) {
    updateProfile((draft) => {
      draft.messages = draft.messages.filter((message) => message.id !== messageId);
      setSelectedNode(draft.messages[0] ? { kind: "message", messageId: draft.messages[0].id } : { kind: "messages" });
    });
  }

  function renderOutlineButton(node: ProfileNode, title: string, detail?: string, icon?: React.ReactNode) {
    const active = nodeKey(selectedNode) === nodeKey(node);
    return (
      <button
        type="button"
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted ${active ? "bg-primary/10 text-primary" : ""}`}
        onClick={() => setSelectedNode(node)}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{title}</span>
          {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
        </span>
      </button>
    );
  }

  function renderGroup(id: string, title: string, children: React.ReactNode, action?: React.ReactNode) {
    const open = expanded[id] ?? false;
    return (
      <div>
        <div className="flex items-center gap-1 px-1 py-1">
          <button
            type="button"
            className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded px-1 text-left text-xs font-medium uppercase text-muted-foreground hover:bg-muted"
            onClick={() => setExpanded((state) => ({ ...state, [id]: !open }))}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {title}
          </button>
          {action}
        </div>
        {open && <div className="space-y-1 pl-1">{children}</div>}
      </div>
    );
  }

  function renderOutline() {
    const activeProfile = currentProfile;
    const normalizedSearch = search.trim().toLowerCase();
    const dictionaries = Object.entries(activeProfile.dictionaries ?? {});
    const errors = activeProfile.errors ?? [];
    const filteredMessages = activeProfile.messages.filter((message) =>
      matchesSearch(normalizedSearch, message.id, message.label, message.description, Object.keys(message.identifyBy).join(" ")),
    );

    return (
      <Card className="flex min-h-0 w-[300px] min-w-[240px] resize-x flex-col overflow-hidden rounded-lg shadow-sm">
        <CardHeader className="border-b p-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Profile outline</CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Open profile editor help" onClick={() => openHelp("profile-editor")}>
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search profile" />
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
          {renderOutlineButton({ kind: "meta" }, "Metadata", activeProfile.meta.version, <FileJson className="h-4 w-4" />)}
          {renderOutlineButton({ kind: "bus" }, "Bus", `${activeProfile.bus.type}, ${activeProfile.bus.idFormat}`, <Database className="h-4 w-4" />)}
          {renderGroup(
            "layouts",
            "Layouts",
            <>
              {renderOutlineButton({ kind: "can-id" }, activeProfile.layouts.canId.label ?? "CAN ID", `${activeProfile.layouts.canId.fields.length} fields`, <Braces className="h-4 w-4" />)}
              {activeProfile.layouts.payloadHeader &&
                renderOutlineButton({ kind: "payload-header" }, activeProfile.layouts.payloadHeader.label ?? "Payload header", `${activeProfile.layouts.payloadHeader.fields.length} fields`, <Braces className="h-4 w-4" />)}
            </>,
          )}
          {renderGroup(
            "messages",
            "Messages",
            filteredMessages.map((message) => renderOutlineButton({ kind: "message", messageId: message.id }, message.label, `${message.payload.fields.length} fields`, <BookOpenText className="h-4 w-4" />)),
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!editable} title="Add message" onClick={addMessage}>
              <Plus className="h-4 w-4" />
            </Button>,
          )}
          {renderGroup(
            "dictionaries",
            "Dictionaries",
            dictionaries.length ? dictionaries.map(([key, values]) => renderOutlineButton({ kind: "dictionary", key }, key, `${Object.keys(values).length} values`, <Database className="h-4 w-4" />)) : <div className="px-2 py-1 text-xs text-muted-foreground">No dictionaries</div>,
          )}
          {renderGroup(
            "errors",
            "Errors",
            errors.length ? errors.map((error) => renderOutlineButton({ kind: "error", errorId: error.id }, error.id, error.when, <CircleAlert className="h-4 w-4" />)) : <div className="px-2 py-1 text-xs text-muted-foreground">No error rules</div>,
          )}
          {renderOutlineButton({ kind: "display" }, "Display", "Presentation hints", <Braces className="h-4 w-4" />)}
        </CardContent>
      </Card>
    );
  }

  function renderFieldTable(fields: CanonicalField[], onChange: (index: number, patch: Partial<CanonicalField>) => void, onAdd?: () => void, onDelete?: (index: number) => void) {
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Fields</div>
            <div className="text-xs text-muted-foreground">Absolute bit coordinates, using `startBit` and `bitLength`.</div>
          </div>
          {onAdd && (
            <Button size="sm" variant="outline" onClick={onAdd} disabled={!editable}>
              <Plus className="h-4 w-4" />
              Field
            </Button>
          )}
        </div>
        <div className="overflow-auto rounded-md border bg-background">
          <table className="w-full table-auto text-xs">
            <thead className="border-b bg-muted/40 uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Name</th>
                <th className="w-20 px-2 py-1.5 text-left font-medium">Start</th>
                <th className="w-20 px-2 py-1.5 text-left font-medium">Bits</th>
                <th className="w-28 px-2 py-1.5 text-left font-medium">Type</th>
                <th className="w-32 px-2 py-1.5 text-left font-medium">Dictionary</th>
                <th className="w-20 px-2 py-1.5 text-left font-medium">Factor</th>
                <th className="w-20 px-2 py-1.5 text-left font-medium">Offset</th>
                <th className="w-20 px-2 py-1.5 text-left font-medium">Unit</th>
                <th className="w-56 px-2 py-1.5 text-left font-medium">Expression</th>
                <th className="w-10 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={`${field.name}-${index}`} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-2 py-1.5">
                    <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" value={field.name} disabled={!editable} onChange={(event) => onChange(index, { name: event.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={field.startBit} disabled={!editable} onChange={(event) => onChange(index, { startBit: Number(event.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={field.bitLength} disabled={!editable} onChange={(event) => onChange(index, { bitLength: Number(event.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select value={field.type ?? "uint"} disabled={!editable} onValueChange={(value) => onChange(index, { type: value as CanonicalField["type"] })}>
                      <SelectTrigger className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus:ring-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uint">uint</SelectItem>
                        <SelectItem value="int">int</SelectItem>
                        <SelectItem value="bool">bool</SelectItem>
                        <SelectItem value="enum">enum</SelectItem>
                        <SelectItem value="bytes">bytes</SelectItem>
                        <SelectItem value="string">string</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" value={field.dictionary ?? ""} disabled={!editable} onChange={(event) => onChange(index, { dictionary: event.target.value || undefined })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={field.factor ?? ""} disabled={!editable} onChange={(event) => onChange(index, { factor: event.target.value === "" ? undefined : Number(event.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" type="number" value={field.offset ?? ""} disabled={!editable} onChange={(event) => onChange(index, { offset: event.target.value === "" ? undefined : Number(event.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8 border-transparent bg-transparent shadow-none hover:bg-background focus-visible:border-ring" value={field.unit ?? ""} disabled={!editable} onChange={(event) => onChange(index, { unit: event.target.value || undefined })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8 border-transparent bg-transparent font-mono text-xs shadow-none hover:bg-background focus-visible:border-ring" value={field.display?.expression ?? ""} disabled={!editable} placeholder="raw * 0.1" onChange={(event) => onChange(index, { display: event.target.value ? { expression: event.target.value } : undefined })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!editable || !onDelete} onClick={() => onDelete?.(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderKeyValueEditor(values: Record<string, unknown>, onChange: (next: Record<string, unknown>) => void) {
    const rows = Object.entries(values);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Values</div>
          <Button
            size="sm"
            variant="outline"
            disabled={!editable}
            onClick={() => {
              onChange({ ...values, field_name: 0 });
            }}
          >
            <Plus className="h-4 w-4" />
            Value
          </Button>
        </div>
        <div className="space-y-1">
          {rows.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                className="h-8"
                value={key}
                disabled={!editable}
                onChange={(event) => {
                  const next = { ...values };
                  delete next[key];
                  next[event.target.value] = value;
                  onChange(next);
                }}
              />
              <Input
                className="h-8"
                value={String(value ?? "")}
                disabled={!editable}
                onChange={(event) => {
                  const numeric = Number(event.target.value);
                  onChange({ ...values, [key]: Number.isFinite(numeric) && event.target.value.trim() !== "" ? numeric : event.target.value });
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!editable}
                onClick={() => {
                  const next = { ...values };
                  delete next[key];
                  onChange(next);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderDefinition() {
    const activeProfile = currentProfile;
    if (selectedNode.kind === "meta") {
      return (
        <section className="grid gap-3 lg:grid-cols-2">
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
          <label className="space-y-1 text-xs font-medium lg:col-span-2">
            Source
            <Input value={activeProfile.meta.source ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.meta.source = event.target.value || undefined))} />
          </label>
        </section>
      );
    }

    if (selectedNode.kind === "bus") {
      return (
        <section className="grid gap-3 lg:grid-cols-3">
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
      );
    }

    if (selectedNode.kind === "can-id") {
      return (
        <div className="space-y-3">
          <section className="grid gap-3 lg:grid-cols-3">
            <label className="space-y-1 text-xs font-medium">
              Label
              <Input value={activeProfile.layouts.canId.label ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.layouts.canId.label = event.target.value || undefined))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Bit length
              <Input type="number" value={activeProfile.layouts.canId.bitLength} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.layouts.canId.bitLength = Number(event.target.value)))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Note
              <Input value={activeProfile.layouts.canId.note ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.layouts.canId.note = event.target.value || undefined))} />
            </label>
          </section>
          {renderFieldTable(
            activeProfile.layouts.canId.fields,
            (index, patch) => updateProfile((draft) => updateField(draft.layouts.canId.fields, index, patch)),
            addCanIdField,
            (index) => updateProfile((draft) => draft.layouts.canId.fields.splice(index, 1)),
          )}
        </div>
      );
    }

    if (selectedNode.kind === "payload-header") {
      const header = activeProfile.layouts.payloadHeader;
      if (!header) return <div className="text-sm text-muted-foreground">This profile does not define a payload header.</div>;
      return (
        <div className="space-y-3">
          <section className="grid gap-3 lg:grid-cols-3">
            <label className="space-y-1 text-xs font-medium">
              Label
              <Input value={header.label ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.layouts.payloadHeader!.label = event.target.value || undefined))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Bit length
              <Input type="number" value={header.bitLength} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.layouts.payloadHeader!.bitLength = Number(event.target.value)))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Note
              <Input value={header.note ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.layouts.payloadHeader!.note = event.target.value || undefined))} />
            </label>
          </section>
          {renderFieldTable(
            header.fields,
            (index, patch) => updateProfile((draft) => updateField(draft.layouts.payloadHeader!.fields, index, patch)),
            addPayloadHeaderField,
            (index) => updateProfile((draft) => draft.layouts.payloadHeader!.fields.splice(index, 1)),
          )}
        </div>
      );
    }

    if (selectedNode.kind === "messages") {
      return (
        <section className="flex h-full items-center justify-center rounded-md border border-dashed p-8 text-center">
          <div>
            <div className="text-sm font-medium">{activeProfile.messages.length} messages</div>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">Select a message in the outline to edit its identification values and payload fields.</p>
            <Button className="mt-4" variant="outline" disabled={!editable} onClick={addMessage}>
              <Plus className="h-4 w-4" />
              Message
            </Button>
          </div>
        </section>
      );
    }

    if (selectedNode.kind === "message") {
      const message = activeProfile.messages.find((item) => item.id === selectedNode.messageId);
      if (!message) return null;
      return (
        <div className="space-y-4">
          <section className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              ID
              <Input value={message.id} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.messages.find((item) => item.id === message.id)!.id = event.target.value))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Label
              <Input value={message.label} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.messages.find((item) => item.id === message.id)!.label = event.target.value))} />
            </label>
            <label className="space-y-1 text-xs font-medium lg:col-span-2">
              Description
              <Input value={message.description ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.messages.find((item) => item.id === message.id)!.description = event.target.value || undefined))} />
            </label>
          </section>
          {renderKeyValueEditor(message.identifyBy, (next) => updateProfile((draft) => void (draft.messages.find((item) => item.id === message.id)!.identifyBy = next as CanonicalMessage["identifyBy"])))}
          <section className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              Payload bit length
              <Input type="number" value={message.payload.bitLength} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.messages.find((item) => item.id === message.id)!.payload.bitLength = Number(event.target.value)))} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Payload display expression
              <Input value={message.payload.display?.expression ?? ""} disabled={!editable} onChange={(event) => updateProfile((draft) => void (draft.messages.find((item) => item.id === message.id)!.payload.display = event.target.value ? { expression: event.target.value } : undefined))} />
            </label>
          </section>
          {renderFieldTable(
            message.payload.fields,
            (index, patch) => updateProfile((draft) => updateField(draft.messages.find((item) => item.id === message.id)!.payload.fields, index, patch)),
            () => addPayloadField(message.id),
            (index) => updateProfile((draft) => draft.messages.find((item) => item.id === message.id)!.payload.fields.splice(index, 1)),
          )}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" disabled={!editable} onClick={() => deleteMessage(message.id)}>
              <Trash2 className="h-4 w-4" />
              Delete message
            </Button>
          </div>
        </div>
      );
    }

    if (selectedNode.kind === "dictionary") {
      const values = activeProfile.dictionaries?.[selectedNode.key] ?? {};
      return (
        <section className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-sm font-medium">{selectedNode.key}</div>
            <div className="text-xs text-muted-foreground">{Object.keys(values).length} values</div>
          </div>
          <pre className="max-h-[520px] overflow-auto rounded-md border bg-background p-3 text-xs">{JSON.stringify(values, null, 2)}</pre>
        </section>
      );
    }

    if (selectedNode.kind === "errors") {
      return <pre className="max-h-[620px] overflow-auto rounded-md border bg-background p-3 text-xs">{JSON.stringify(activeProfile.errors ?? [], null, 2)}</pre>;
    }

    if (selectedNode.kind === "error") {
      const error = activeProfile.errors?.find((item) => item.id === selectedNode.errorId);
      return <pre className="max-h-[620px] overflow-auto rounded-md border bg-background p-3 text-xs">{JSON.stringify(error ?? {}, null, 2)}</pre>;
    }

    if (selectedNode.kind === "dictionaries") {
      return <pre className="max-h-[620px] overflow-auto rounded-md border bg-background p-3 text-xs">{JSON.stringify(activeProfile.dictionaries ?? {}, null, 2)}</pre>;
    }

    return <pre className="max-h-[620px] overflow-auto rounded-md border bg-background p-3 text-xs">{JSON.stringify(activeProfile.display ?? {}, null, 2)}</pre>;
  }

  return (
    <div className="flex h-full min-h-0 gap-4 overflow-hidden">
      {renderOutline()}
      <Card className="flex min-h-0 min-w-[420px] flex-1 flex-col rounded-lg shadow-sm">
        <CardHeader className="border-b p-4 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">Definition editor</div>
              <CardTitle className="mt-1 text-sm">{profileTitle(activeProfile, selectedNode)}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{profileNote(selectedNode)}</p>
            </div>
            <div className="flex items-center gap-2">
              {!editable && <Badge variant="outline">Read only</Badge>}
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Open profile editor help" onClick={() => openHelp("profile-editor")}>
                <HelpCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-4 pb-8">{renderDefinition()}</CardContent>
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
