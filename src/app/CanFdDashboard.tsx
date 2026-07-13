import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConnectionStore } from "@/store/connectionStore";
import { useAppStore } from "@/store/appShellStore";
import { useUiStore } from "@/store/uiStore";
import { useTransmitDraftStore } from "@/store/transmitDraftStore";
import { monitorColumnLabels, MonitorColumnId, useMonitorPreferencesStore } from "@/store/monitorPreferencesStore";
import { resolveProfileReferences, useProfileStore } from "@/profile-editor/store/profileStore";
import { DecodedField, DecodedFrame, decodeFrameWithProfiles } from "@/profile-editor/decodeProfile";
import { DecodedPreviewColumnMenu, DecodedPreviewPanel } from "@/profile-editor/DecodedPreviewPanel";
import { parseCandump } from "@/can/candump";
import { Activity, Cable, Columns3, Download, Eye, EyeOff, FileUp, Gauge, HelpCircle, Pause, Play, RadioTower, Search, Send, Trash2, X } from "lucide-react";
import { forwardRef, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { HTMLAttributes, KeyboardEvent, MouseEvent } from "react";
import { TableVirtuoso } from "react-virtuoso";
import type { TableComponents, TableVirtuosoHandle } from "react-virtuoso";
import type { WsFrame } from "@/can-bridge/ws/types";
import type { CanProfile } from "@/profile-editor/model/profile";
import { getProfileMessageSchema } from "@/profile-editor/profileAdapter";

function formatCanId(id: number) {
  return id.toString(16).toUpperCase().padStart(id > 0x7ff ? 8 : 3, "0");
}

function byteLength(dataHex: string) {
  return Math.floor(dataHex.replace(/[^0-9a-fA-F]/g, "").length / 2);
}

function formatPayloadBytes(dataHex: string) {
  const cleaned = dataHex.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return cleaned.match(/.{1,2}/g)?.join(" ") ?? "";
}

function formatTime(tsMs: number) {
  const date = new Date(tsMs);
  if (!Number.isFinite(date.getTime())) return tsMs.toString();

  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function parseCanId(value: string) {
  const normalized = value.trim().replace(/^0x/i, "");
  return Number.parseInt(normalized, 16);
}

const monitorColumnOrder: MonitorColumnId[] = ["line", "time", "iface", "canId", "dir", "len", "mode", "payload"];

type DynamicMonitorColumn = {
  id: string;
  label: string;
};

type TraceColumn = {
  id: string;
  label: string;
  kind: "static" | "canId" | "payloadHeader";
};

type TraceRow = {
  key: string;
  frame: WsFrame;
  decoded: DecodedFrame | null;
  hasError: boolean;
  values: Record<string, string>;
  numericValues: Record<string, number>;
  haystack: string;
};

function uniqueProfiles(profiles: Array<CanProfile | null>) {
  const seen = new Set<CanProfile>();
  return profiles.filter((profile): profile is CanProfile => {
    if (!profile || seen.has(profile)) return false;
    seen.add(profile);
    return true;
  });
}

function profileCanIdColumns(profile: CanProfile) {
  const defaultLayout = profile.defaultCanIdLayoutId
    ? profile.canIdLayouts?.[profile.defaultCanIdLayoutId]
    : Object.values(profile.canIdLayouts ?? {})[0];
  const schema = getProfileMessageSchema(profile);
  const fields = schema
    ? (schema.canIdLayout?.fields ?? defaultLayout?.fields ?? [])
    : profile.knossos
      ? profile.knossos.canIdLayout.fields
      : defaultLayout?.fields ?? [];

  return fields.map((field) => ({
    id: `canId:${field.name}`,
    label: field.name,
  }));
}

function profilePayloadColumns(profile: CanProfile) {
  const names = new Set<string>();
  const schema = getProfileMessageSchema(profile);
  if (schema) {
    for (const field of schema.payloadHeader?.fields ?? []) names.add(field.name);
  } else if (profile.knossos) {
    for (const field of profile.knossos.payloadHeader.fields) names.add(field.name);
  } else {
    for (const frame of Object.values(profile.frames)) {
      for (const signal of frame.signals) names.add(signal.name);
    }
  }

  return Array.from(names).map((name) => ({
    id: `payload:${name}`,
    label: name,
  }));
}

type FilterClause = {
  connector: "and" | "or";
  field?: string;
  operator?: "==" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "~=";
  value: string;
};

type FilterResult = {
  clauses: FilterClause[];
  valid: boolean;
  error?: string;
};

function rowKeyFor(frame: WsFrame, index: number) {
  return `${frame.ts_ms}-${frame.iface}-${frame.id}-${index}`;
}

function formatDecodedValue(field: DecodedField) {
  return field.displayValue;
}

function formatPayloadCell(frame: WsFrame, decoded: DecodedFrame | null | undefined) {
  if (!decoded?.payloadFields.length) return frame.data_hex;
  return decoded.payloadFields.map((field) => `${field.name}=${formatDecodedValue(field)}`).join(", ");
}

function formatPayloadValuesCell(frame: WsFrame, decoded: DecodedFrame | null | undefined, headerNames: Set<string>) {
  if (decoded?.errorCode != null || decoded?.messageGood === false) {
    return `Error${decoded.errorCode != null ? ` ${decoded.errorCode}` : ""}: ${decoded.errorText ?? "Unknown error"}`;
  }
  const fields = (decoded?.payloadFields ?? []).filter((field) => !headerNames.has(field.name));
  if (!fields.length) return frame.data_hex;
  return fields.map((field) => `${field.name}=${formatDecodedValue(field)}`).join(", ");
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFilter(input: string): FilterResult {
  const text = input.trim();
  if (!text) return { clauses: [], valid: true };

  const clauses: FilterClause[] = [];
  const pattern =
    /\s*(?:(and|or)\s+)?(?:(\w[\w.:-]*)\s*(==|!=|>=|<=|>|<|~=|contains)\s*)?(".*?"|'.*?'|[^\s]+)(?=\s+(?:and|or)\s+|\s*$)/giy;
  let consumed = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index !== consumed) {
      return { clauses, valid: false, error: `Invalid filter near: ${text.slice(consumed).trim()}` };
    }
    clauses.push({
      connector: (match[1]?.toLowerCase() as "and" | "or" | undefined) ?? (clauses.length ? "and" : "and"),
      field: match[2],
      operator: match[3] as FilterClause["operator"],
      value: stripQuotes(match[4]),
    });
    consumed = pattern.lastIndex;
  }

  if (consumed !== text.length) {
    return { clauses, valid: false, error: `Invalid filter near: ${text.slice(consumed).trim()}` };
  }

  for (const clause of clauses) {
    if (clause.operator === "~=") {
      try {
        new RegExp(clause.value, "i");
      } catch {
        return { clauses, valid: false, error: `Invalid regex: ${clause.value}` };
      }
    }
  }

  return { clauses, valid: true };
}

function parseComparableNumber(value: string) {
  const normalized = value.trim().replace(/^0x/i, "");
  if (/^0x/i.test(value.trim())) return Number.parseInt(normalized, 16);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function getRowField(row: TraceRow, fieldName: string) {
  const wanted = normalizeKey(fieldName);
  const key = Object.keys(row.values).find((candidate) => normalizeKey(candidate) === wanted);
  return key ? { value: row.values[key], numeric: row.numericValues[key] } : undefined;
}

function compareFilterValue(actual: string, actualNumber: number | undefined, operator: FilterClause["operator"], expected: string) {
  const actualLower = actual.toLowerCase();
  const expectedLower = expected.toLowerCase();
  const expectedNumber = parseComparableNumber(expected);

  if (!operator || operator === "contains") return actualLower.includes(expectedLower);
  if (operator === "==") return actualLower === expectedLower || (actualNumber != null && expectedNumber != null && actualNumber === expectedNumber);
  if (operator === "!=") return actualLower !== expectedLower && (actualNumber == null || expectedNumber == null || actualNumber !== expectedNumber);
  if (operator === "~=") {
    try {
      return new RegExp(expected, "i").test(actual);
    } catch {
      return false;
    }
  }

  if (actualNumber == null || expectedNumber == null) return false;
  if (operator === ">") return actualNumber > expectedNumber;
  if (operator === "<") return actualNumber < expectedNumber;
  if (operator === ">=") return actualNumber >= expectedNumber;
  if (operator === "<=") return actualNumber <= expectedNumber;
  return false;
}

function rowMatchesClause(row: TraceRow, clause: FilterClause) {
  if (!clause.field && clause.value.toLowerCase() === "error") return row.hasError;
  if (!clause.field) return row.haystack.includes(clause.value.toLowerCase());

  const field = getRowField(row, clause.field);
  if (!field) return false;
  return compareFilterValue(field.value, field.numeric, clause.operator, clause.value);
}

function rowMatchesFilter(row: TraceRow, parsed: FilterResult) {
  if (!parsed.valid) return true;
  if (!parsed.clauses.length) return true;

  return parsed.clauses.reduce((result, clause, index) => {
    const clauseResult = rowMatchesClause(row, clause);
    if (index === 0) return clauseResult;
    return clause.connector === "or" ? result || clauseResult : result && clauseResult;
  }, true);
}

function buildTraceRow(frame: WsFrame, index: number, decoded: DecodedFrame | null): TraceRow {
  const values: Record<string, string> = {
    time: formatTime(frame.ts_ms),
    line: String(frame.line_no ?? index + 1),
    iface: frame.iface,
    canId: formatCanId(frame.id),
    id: formatCanId(frame.id),
    dir: frame.dir.toUpperCase(),
    len: String(byteLength(frame.data_hex)),
    mode: frame.is_fd ? "CAN-FD" : "Classic",
    payload: frame.data_hex,
    rawPayload: frame.data_hex,
    message: formatCanMessage(frame),
    txStatus: frame.tx_status ?? "",
    txError: frame.tx_error ?? "",
  };
  const numericValues: Record<string, number> = {
    time: frame.ts_ms,
    line: frame.line_no ?? index + 1,
    canId: frame.id,
    id: frame.id,
    len: byteLength(frame.data_hex),
  };
  if (frame.tx_status) {
    numericValues.txStatus = frame.tx_status === "sent" ? 1 : frame.tx_status === "pending" ? 0 : -1;
  }

  if (decoded) {
    const hasError = decoded.errorCode != null || decoded.messageGood === false;
    const metadata: Record<string, string | number | boolean | undefined> = {
      meaning: decoded.meaning,
      frameName: decoded.frameName,
      serviceName: decoded.serviceName,
      serviceIdentifier: decoded.serviceIdentifier,
      instanceName: decoded.instanceName,
      instanceIndex: decoded.instanceIndex,
      attributeName: decoded.attributeName,
      attributeAddress: decoded.attributeAddress,
      featureName: decoded.featureName,
      featureIndex: decoded.featureIndex,
      commandClass: decoded.commandClass,
      sourceAddress: decoded.sourceAddress,
      destinationAddress: decoded.destinationAddress,
      messageGood: decoded.messageGood,
      errorCode: decoded.errorCode,
      errorText: decoded.errorText,
      hasError,
      error: hasError ? `${decoded.errorCode != null ? `Error ${decoded.errorCode}` : "Error"} ${decoded.errorText ?? ""}`.trim() : undefined,
    };
    values.payload = formatPayloadCell(frame, decoded);
    for (const [key, value] of Object.entries(metadata)) {
      if (value == null) continue;
      values[key] = String(value);
      if (typeof value === "number") numericValues[key] = value;
      if (typeof value === "boolean") numericValues[key] = value ? 1 : 0;
    }
  }

  for (const field of decoded?.canIdFields ?? []) {
    values[field.name] = field.displayValue;
    values[`canId:${field.name}`] = field.displayValue;
    numericValues[field.name] = field.physical;
    numericValues[`canId:${field.name}`] = field.physical;
  }
  for (const field of decoded?.payloadFields ?? []) {
    values[field.name] = field.displayValue;
    values[`payload:${field.name}`] = field.displayValue;
    numericValues[field.name] = field.physical;
    numericValues[`payload:${field.name}`] = field.physical;
  }

  return {
    key: rowKeyFor(frame, index),
    frame,
    decoded,
    hasError: Boolean(decoded?.errorCode != null || decoded?.messageGood === false),
    values,
    numericValues,
    haystack: Object.values(values).join(" ").toLowerCase(),
  };
}

function formatCanMessage(frame: WsFrame) {
  return `${frame.iface} ${formatCanId(frame.id)} [${byteLength(frame.data_hex).toString().padStart(2, "0")}] ${formatPayloadBytes(frame.data_hex)}`.trim();
}

function formatCandumpLine(frame: WsFrame) {
  return `(${(frame.ts_ms / 1000).toFixed(6)}) ${formatCanMessage(frame)}`;
}

function downloadTextFile(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
}

type CellContextMenu = {
  x: number;
  y: number;
  frame: WsFrame;
  rowKey: string;
  columnId: string;
  value: string;
  decodedField?: DecodedField;
};

type HeaderContextMenu = {
  x: number;
  y: number;
  column: TraceColumn;
};

type DisplayFilterPreset = {
  id: string;
  name: string;
  expression: string;
};

const DISPLAY_FILTER_PRESETS_KEY = "cansim.monitor.filterPresets.v1";

function loadDisplayFilterPresets(): DisplayFilterPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISPLAY_FILTER_PRESETS_KEY) ?? "[]") as DisplayFilterPreset[];
    return Array.isArray(parsed) ? parsed.filter((preset) => preset.name && preset.expression) : [];
  } catch {
    return [];
  }
}

function saveDisplayFilterPresets(presets: DisplayFilterPreset[]) {
  localStorage.setItem(DISPLAY_FILTER_PRESETS_KEY, JSON.stringify(presets));
}

function filterFieldForColumn(column: TraceColumn) {
  if (column.kind === "canId") return column.id;
  if (column.kind === "payloadHeader") return column.id;
  return column.id;
}

function quoteFilterValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "\"\"";
  if (/^[A-Za-z0-9_.:-]+$/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function defaultOperatorForColumn(column: TraceColumn, value?: string) {
  if (column.id === "payload" || value?.includes(", ")) return "contains";
  return "==";
}

function buildColumnFilterExpression(column: TraceColumn, value?: string) {
  const field = filterFieldForColumn(column);
  const operator = defaultOperatorForColumn(column, value);
  return value == null ? `${field} ${operator} ` : `${field} ${operator} ${quoteFilterValue(value)}`;
}

function appendFilterExpression(current: string, expression: string, connector: "and" | "or") {
  const trimmed = current.trim();
  if (!trimmed) return expression;
  return `${trimmed} ${connector} ${expression}`;
}

function TraceColumnMenu({
  canIdColumns,
  payloadColumns,
}: {
  canIdColumns: DynamicMonitorColumn[];
  payloadColumns: DynamicMonitorColumn[];
}) {
  const columns = useMonitorPreferencesStore((s) => s.monitorColumns);
  const dynamicColumnState = useMonitorPreferencesStore((s) => s.dynamicMonitorColumns);
  const toggleColumn = useMonitorPreferencesStore((s) => s.toggleMonitorColumn);
  const toggleDynamicColumn = useMonitorPreferencesStore((s) => s.toggleDynamicMonitorColumn);
  const staticColumns = monitorColumnOrder;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
          <Columns3 className="h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Trace columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {staticColumns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column}
            checked={columns[column]}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => toggleColumn(column)}
          >
            {monitorColumnLabels[column]}
          </DropdownMenuCheckboxItem>
        ))}
        {canIdColumns.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>CAN ID fields</DropdownMenuLabel>
            {canIdColumns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={dynamicColumnState[column.id] ?? true}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => toggleDynamicColumn(column.id)}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
        {payloadColumns.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Payload fields</DropdownMenuLabel>
            {payloadColumns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={dynamicColumnState[column.id] ?? true}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => toggleDynamicColumn(column.id)}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CanFdDashboard() {
  const openConnectionManager = useUiStore((s) => s.openConnectionManager);
  const setView = useAppStore((s) => s.setView);
  const editFrameFromTrace = useProfileStore((s) => s.editFrameFromTrace);
  const stageSharedTransmitDraft = useTransmitDraftStore((s) => s.stageFrame);
  const selectMessageDefinition = useProfileStore((s) => s.selectMessageDefinition);
  const selectLoadedProfile = useProfileStore((s) => s.selectLoadedProfile);
  const setProfileViewMode = useProfileStore((s) => s.setViewMode);
  const rawProfileForDecode = useProfileStore((s) => s.draftProfile ?? s.profile);
  const loadedProfileLibrary = useProfileStore((s) => s.loadedProfiles);
  const profilesForDecode = useMemo(
    () =>
      uniqueProfiles([rawProfileForDecode, ...loadedProfileLibrary]).map((profile) =>
        resolveProfileReferences(profile, loadedProfileLibrary) ?? profile,
      ),
    [loadedProfileLibrary, rawProfileForDecode],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    profiles,
    activeId,
    status,
    subscribedIfaces,
    capturePaused,
    frames,
    traceSourceName,
    disconnect,
    pauseCapture,
    resumeCapture,
    clearFrames,
    loadTraceFrames,
    sendFrame,
    waitForFrame,
  } = useConnectionStore();

  const activeProfile = profiles.find((profile) => profile.id === activeId);
  const search = useMonitorPreferencesStore((s) => s.search);
  const setSearch = useMonitorPreferencesStore((s) => s.setSearch);
  const monitorColumns = useMonitorPreferencesStore((s) => s.monitorColumns);
  const dynamicMonitorColumns = useMonitorPreferencesStore((s) => s.dynamicMonitorColumns);
  const setDynamicMonitorColumns = useMonitorPreferencesStore((s) => s.setDynamicMonitorColumns);
  const columnOrder = useMonitorPreferencesStore((s) => s.columnOrder);
  const setColumnOrder = useMonitorPreferencesStore((s) => s.setColumnOrder);
  const showDecodedPreview = useMonitorPreferencesStore((s) => s.showDecodedPreview);
  const setShowDecodedPreview = useMonitorPreferencesStore((s) => s.setShowDecodedPreview);
  const showTransmitComposer = useMonitorPreferencesStore((s) => s.showTransmitComposer);
  const setShowTransmitComposer = useMonitorPreferencesStore((s) => s.setShowTransmitComposer);
  const selectedFrameKey = useMonitorPreferencesStore((s) => s.selectedTraceRowKey ?? null);
  const setSelectedFrameKey = useMonitorPreferencesStore((s) => s.setSelectedTraceRowKey);
  const tableVirtuosoRef = useRef<TableVirtuosoHandle>(null);
  const cyclicTimerRef = useRef<number | null>(null);
  const cyclicRunningRef = useRef(false);
  const [draftSearch, setDraftSearch] = useState(search);
  const [txId, setTxId] = useState("18DA10F1");
  const [txPayload, setTxPayload] = useState("02 10 03 00 00 00 00 00");
  const [txDlc, setTxDlc] = useState("8");
  const [txRetryCount, setTxRetryCount] = useState("0");
  const [cyclicPeriod, setCyclicPeriod] = useState("100");
  const [cyclicUnit, setCyclicUnit] = useState<"ms" | "s">("ms");
  const [cyclicMode, setCyclicMode] = useState<"fire-and-forget" | "wait-ack" | "wait-response">("fire-and-forget");
  const [cyclicLatePolicy, setCyclicLatePolicy] = useState<"send-anyway" | "skip" | "stop">("skip");
  const [cyclicExpectedResponse, setCyclicExpectedResponse] = useState("__any_rx");
  const [cyclicResponseTimeout, setCyclicResponseTimeout] = useState("1000");
  const [cyclicActive, setCyclicActive] = useState(false);
  const [contextMenu, setContextMenu] = useState<CellContextMenu | null>(null);
  const [headerContextMenu, setHeaderContextMenu] = useState<HeaderContextMenu | null>(null);
  const [filterPresets, setFilterPresets] = useState<DisplayFilterPreset[]>(loadDisplayFilterPresets);
  const [selectedFilterPresetId, setSelectedFilterPresetId] = useState("");

  useEffect(() => {
    setDraftSearch(search);
  }, [search]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (draftSearch !== search) setSearch(draftSearch);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [draftSearch, search, setSearch]);

  const appliedSearch = useDeferredValue(search);
  const parsedFilter = useMemo(() => parseFilter(appliedSearch), [appliedSearch]);
  const draftParsedFilter = useMemo(() => parseFilter(draftSearch), [draftSearch]);
  const filterPending = draftSearch !== appliedSearch;

  const traceRows = useMemo(
    () =>
      frames.map((frame, index) => {
        const decoded = decodeFrameWithProfiles(profilesForDecode, frame);
        return buildTraceRow(frame, index, decoded);
      }),
    [frames, profilesForDecode],
  );

  const filteredRows = useMemo(() => traceRows.filter((row) => rowMatchesFilter(row, parsedFilter)), [parsedFilter, traceRows]);
  const traceStats = useMemo(() => {
    const total = filteredRows.length;
    const rx = filteredRows.filter((row) => row.frame.dir === "rx").length;
    const tx = filteredRows.filter((row) => row.frame.dir === "tx").length;
    const errors = filteredRows.filter((row) => row.hasError).length;
    const txFailed = filteredRows.filter((row) => row.frame.tx_status === "failed").length;
    const byCanId = new Map<string, number>();
    for (const row of filteredRows) {
      const id = formatCanId(row.frame.id);
      byCanId.set(id, (byCanId.get(id) ?? 0) + 1);
    }
    const topIds = Array.from(byCanId.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      total,
      rx,
      tx,
      errors,
      txFailed,
      uniqueIds: byCanId.size,
      topIds,
    };
  }, [filteredRows]);

  const dynamicCanIdColumns = useMemo<DynamicMonitorColumn[]>(() => {
    const byId = new Map<string, DynamicMonitorColumn>();
    for (const profile of profilesForDecode) {
      for (const column of profileCanIdColumns(profile)) byId.set(column.id, column);
    }
    return Array.from(byId.values());
  }, [profilesForDecode]);

  const dynamicPayloadColumns = useMemo<DynamicMonitorColumn[]>(() => {
    const byId = new Map<string, DynamicMonitorColumn>();
    for (const profile of profilesForDecode) {
      for (const column of profilePayloadColumns(profile)) byId.set(column.id, column);
    }
    return Array.from(byId.values());
  }, [profilesForDecode]);

  const payloadHeaderNames = useMemo(() => new Set(dynamicPayloadColumns.map((column) => column.label)), [dynamicPayloadColumns]);
  const expectedResponseOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const profile of profilesForDecode) {
      const schema = getProfileMessageSchema(profile);
      for (const definition of schema?.messageDefinitions ?? []) {
        const commandClass = definition.match?.canId?.command_class;
        if (commandClass != null && !["3", "5", "response", "event", "event/notification"].includes(String(commandClass))) {
          continue;
        }
        const id = definition.id ?? definition.name ?? definition.label;
        if (!id) continue;
        byId.set(id, definition.label ?? definition.name ?? definition.meaning ?? id);
      }
    }
    return Array.from(byId.entries()).map(([id, label]) => ({ id, label }));
  }, [profilesForDecode]);
  const showRawPayloadColumn = dynamicPayloadColumns.length === 0;
  const payloadColumnLabel = showRawPayloadColumn ? "Raw Payload" : "Payload Values";
  const allTraceColumns = useMemo<TraceColumn[]>(() => {
    const staticColumns: TraceColumn[] = monitorColumnOrder.map((id) => ({
      id,
      label: id === "payload" ? payloadColumnLabel : monitorColumnLabels[id],
      kind: "static" as const,
    }));
    const canIdColumns: TraceColumn[] = dynamicCanIdColumns.map((column) => ({ ...column, kind: "canId" as const }));
    const payloadColumns: TraceColumn[] = dynamicPayloadColumns.map((column) => ({ ...column, kind: "payloadHeader" as const }));
    const byId = new Map([...staticColumns, ...canIdColumns, ...payloadColumns].map((column) => [column.id, column]));
    return [
      ...columnOrder.map((id) => byId.get(id)).filter((column): column is TraceColumn => Boolean(column)),
      ...Array.from(byId.values()).filter((column) => !columnOrder.includes(column.id)),
    ];
  }, [columnOrder, dynamicCanIdColumns, dynamicPayloadColumns, payloadColumnLabel]);
  const visibleTraceColumns = useMemo(
    () =>
      allTraceColumns.filter((column) => {
        if (column.kind === "static") return monitorColumns[column.id as MonitorColumnId];
        return dynamicMonitorColumns[column.id] ?? true;
      }),
    [allTraceColumns, dynamicMonitorColumns, monitorColumns],
  );

  useEffect(() => {
    setDynamicMonitorColumns([...dynamicCanIdColumns, ...dynamicPayloadColumns].map((column) => column.id));
  }, [dynamicCanIdColumns, dynamicPayloadColumns, setDynamicMonitorColumns]);

  const selectedFrame = useMemo(() => {
    const selected = selectedFrameKey ? filteredRows.find((row) => row.key === selectedFrameKey)?.frame : undefined;
    return selected ?? filteredRows[filteredRows.length - 1]?.frame ?? frames[frames.length - 1];
  }, [filteredRows, frames, selectedFrameKey]);

  const selectedTraceRow = useMemo(() => {
    if (selectedFrameKey) return traceRows.find((row) => row.key === selectedFrameKey) ?? null;
    if (selectedFrame) return traceRows.find((row) => row.frame === selectedFrame) ?? null;
    return null;
  }, [selectedFrame, selectedFrameKey, traceRows]);

  const selectedDecodedFrame = useMemo(() => {
    const frame = selectedFrame;
    return frame ? decodeFrameWithProfiles(profilesForDecode, frame) : null;
  }, [profilesForDecode, selectedFrame]);

  const connected = status === "connected";
  const connectionLabel =
    status === "error" ? "Failed" : status === "connected" ? "Connected" : status === "connecting" ? "Connecting" : "Disconnected";
  const activeIface = subscribedIfaces[0] ?? activeProfile?.iface ?? "vcan0";
  const txDisabledReason = connected ? undefined : "Connect to a CAN interface or remote bridge before sending frames.";
  const cyclicDisabledReason = cyclicActive ? undefined : txDisabledReason;
  const visibleMonitorColumnCount =
    visibleTraceColumns.length;

  useEffect(() => {
    if (status !== "connected" || traceSourceName) return;
    window.requestAnimationFrame(() => {
      tableVirtuosoRef.current?.scrollToIndex({ index: Math.max(0, filteredRows.length - 1), align: "end" });
    });
  }, [filteredRows.length, frames.length, status, traceSourceName]);

  useEffect(
    () => () => {
      cyclicRunningRef.current = false;
      if (cyclicTimerRef.current != null) window.clearTimeout(cyclicTimerRef.current);
    },
    [],
  );

  function shouldIgnoreNavigationKey(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    const tagName = target.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
  }

  function selectTraceRowAt(index: number) {
    if (!filteredRows.length) return;
    const nextIndex = Math.max(0, Math.min(filteredRows.length - 1, index));
    const nextRow = filteredRows[nextIndex];
    setSelectedFrameKey(nextRow.key);
    tableVirtuosoRef.current?.scrollToIndex({ index: nextIndex, align: "center" });
  }

  function handleMonitorKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (shouldIgnoreNavigationKey(event)) return;
    const selectedIndex = Math.max(0, filteredRows.findIndex((row) => row.key === selectedFrameKey));
    const pageSize = 10;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectTraceRowAt(selectedIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectTraceRowAt(selectedIndex - 1);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      selectTraceRowAt(selectedIndex + pageSize);
    } else if (event.key === "PageUp") {
      event.preventDefault();
      selectTraceRowAt(selectedIndex - pageSize);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTraceRowAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTraceRowAt(filteredRows.length - 1);
    } else if (event.key === "Enter" && selectedFrame) {
      event.preventDefault();
      setShowDecodedPreview(!showDecodedPreview);
    }
  }

  useEffect(() => {
    if (!connected) stopCyclicTx();
  }, [connected]);

  function moveTraceColumn(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const current = allTraceColumns.map((column) => column.id);
    const sourceIndex = current.indexOf(sourceId);
    const targetIndex = current.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...current];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setColumnOrder(next);
  }

  function openDisplayFilterHelp() {
    window.location.hash = "can-monitor-display-filters";
    setView("help");
  }

  function exportCandumpLog() {
    const source = traceSourceName?.replace(/\.[^.]+$/, "") || "can-capture";
    downloadTextFile(`${source}.candump.log`, frames.map(formatCandumpLine).join("\n"), "text/plain");
  }

  function exportVisibleCsv() {
    const headers = visibleTraceColumns.map((column) => column.label);
    const rows = filteredRows.map((row) =>
      visibleTraceColumns.map((column) => {
        if (column.kind === "static") {
          if (column.id === "line") return String(row.frame.line_no ?? row.numericValues.line);
          if (column.id === "time") return formatTime(row.frame.ts_ms);
          if (column.id === "iface") return row.frame.iface;
          if (column.id === "canId") return formatCanId(row.frame.id);
          if (column.id === "dir") return row.frame.dir.toUpperCase();
          if (column.id === "len") return String(byteLength(row.frame.data_hex));
          if (column.id === "mode") return row.frame.is_fd ? "CAN-FD" : "Classic";
          if (column.id === "payload") {
            return showRawPayloadColumn
              ? formatPayloadCell(row.frame, row.decoded)
              : formatPayloadValuesCell(row.frame, row.decoded, payloadHeaderNames);
          }
        }
        return row.values[column.id] ?? "";
      }),
    );
    downloadTextFile(
      `${traceSourceName?.replace(/\.[^.]+$/, "") || "can-monitor-view"}.csv`,
      [headers, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(",")).join("\n"),
      "text/csv",
    );
  }

  function openTransmitComposerHelp() {
    window.location.hash = "transmit-composer";
    setView("help");
    window.setTimeout(() => document.getElementById("transmit-composer")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function txPeriodMs() {
    const value = Math.max(1, Number(cyclicPeriod) || 1);
    return cyclicUnit === "s" ? value * 1000 : value;
  }

  function decodedMatchesExpected(decoded: DecodedFrame | null, expected: string) {
    if (expected === "__any_rx") return true;
    if (!decoded) return false;
    return [decoded.frameName, decoded.meaning, decoded.serviceName, decoded.attributeName, decoded.featureName].some((value) => value === expected);
  }

  async function waitForCanResponse(startedAfterMs: number) {
    const timeoutMs = Math.max(1, Number(cyclicResponseTimeout) || 1000);
    return waitForFrame((frame) => {
      if (frame.dir !== "rx") return false;
      if (frame.ts_ms < startedAfterMs) return false;
      if (frame.iface !== activeIface) return false;
      const decoded = decodeFrameWithProfiles(profilesForDecode, frame);
      return decodedMatchesExpected(decoded, cyclicExpectedResponse);
    }, timeoutMs);
  }

  async function sendCurrentFrame(options?: { waitForResponse?: boolean }) {
    const arbitrationId = parseCanId(txId);
    if (!Number.isFinite(arbitrationId)) return { ok: false, error: "Invalid CAN ID" };
    const startedAfterMs = Date.now();

    const attempts = Math.max(1, Math.min(4, (Number(txRetryCount) || 0) + 1));
    let lastResult: { ok: boolean; error?: string } = { ok: false, error: "Not sent" };
    for (let attempt = 0; attempt < attempts; attempt++) {
      lastResult = await sendFrame({
        iface: activeIface,
        arbitrationId,
        isFd: Number(txDlc) > 8,
        brs: Number(txDlc) > 8,
        dataHex: txPayload,
      });
      if (lastResult.ok) break;
    }
    if (lastResult.ok && options?.waitForResponse) {
      try {
        await waitForCanResponse(startedAfterMs);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Timed out waiting for CAN response" };
      }
    }
    return lastResult;
  }

  function stopCyclicTx() {
    cyclicRunningRef.current = false;
    setCyclicActive(false);
    if (cyclicTimerRef.current != null) {
      window.clearTimeout(cyclicTimerRef.current);
      cyclicTimerRef.current = null;
    }
  }

  function startCyclicTx() {
    if (cyclicRunningRef.current) return;
    cyclicRunningRef.current = true;
    setCyclicActive(true);

    const tick = async () => {
      if (!cyclicRunningRef.current) return;
      const period = txPeriodMs();
      const started = performance.now();

      if (cyclicMode === "fire-and-forget") {
        void sendCurrentFrame();
        cyclicTimerRef.current = window.setTimeout(tick, period);
        return;
      }

      const result = await sendCurrentFrame({ waitForResponse: cyclicMode === "wait-response" });
      if (!cyclicRunningRef.current) return;
      if (!result.ok) {
        const isResponseTimeout = cyclicMode === "wait-response" && result.error?.toLowerCase().includes("timed out");
        if (!isResponseTimeout || cyclicLatePolicy === "stop") {
          stopCyclicTx();
          return;
        }
        if (cyclicLatePolicy === "send-anyway") {
          cyclicTimerRef.current = window.setTimeout(tick, 0);
          return;
        }
        cyclicTimerRef.current = window.setTimeout(tick, period);
        return;
      }

      const elapsed = performance.now() - started;
      if (elapsed > period) {
        if (cyclicLatePolicy === "send-anyway") {
          cyclicTimerRef.current = window.setTimeout(tick, 0);
          return;
        }
        if (cyclicMode === "wait-response") {
          cyclicTimerRef.current = window.setTimeout(tick, period);
          return;
        }
        if (cyclicLatePolicy === "stop") {
          stopCyclicTx();
          return;
        }
      }

      cyclicTimerRef.current = window.setTimeout(tick, Math.max(0, period - elapsed));
    };

    void tick();
  }

  async function openCandumpFile(file: File) {
    const text = await file.text();
    const parsedFrames = parseCandump(text);
    loadTraceFrames(file.name, parsedFrames);
  }

  function defineMessageStructure(frame: WsFrame) {
    editFrameFromTrace(frame);
    setContextMenu(null);
    setView("profile-editor");
  }

  function openDecodedInProfile(decoded: DecodedFrame | null, frame: WsFrame | undefined, _field?: DecodedField) {
    if (!frame) return;
    setProfileViewMode("edit");
    if (decoded?.frameName) {
      const ownerIndex = loadedProfileLibrary.findIndex((profile) =>
        getProfileMessageSchema(profile)?.messageDefinitions?.some((definition) => (definition.id ?? "") === decoded.frameName || definition.name === decoded.frameName),
      );
      if (ownerIndex >= 0) selectLoadedProfile(ownerIndex);
      selectMessageDefinition(decoded.frameName, frame.data_hex);
    } else {
      editFrameFromTrace(frame);
    }
    setView("profile-editor");
  }

  function openCellContextMenu(
    event: MouseEvent,
    frame: WsFrame,
    rowKey: string,
    columnId: string,
    value: string,
    decodedField?: DecodedField,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedFrameKey(rowKey);
    setHeaderContextMenu(null);
    setContextMenu({ x: event.clientX, y: event.clientY, frame, rowKey, columnId, value, decodedField });
  }

  function openHeaderContextMenu(event: MouseEvent, column: TraceColumn) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setHeaderContextMenu({ x: event.clientX, y: event.clientY, column });
  }

  function selectedValueForColumn(column: TraceColumn) {
    const field = filterFieldForColumn(column);
    return selectedTraceRow ? getRowField(selectedTraceRow, field)?.value : undefined;
  }

  function applyColumnFilter(column: TraceColumn, mode: "replace" | "and" | "or", value?: string) {
    const expression = buildColumnFilterExpression(column, value);
    const current = draftSearch;
    const next = mode === "replace" || !current.trim() ? expression : appendFilterExpression(current, expression, mode);
    setDraftSearch(next);
    setSearch(next);
    setHeaderContextMenu(null);
  }

  function clearDisplayFilter() {
    setDraftSearch("");
    setSearch("");
    setHeaderContextMenu(null);
  }

  function setDisplayFilter(value: string) {
    setDraftSearch(value);
  }

  function updateFilterPresets(next: DisplayFilterPreset[]) {
    setFilterPresets(next);
    saveDisplayFilterPresets(next);
  }

  function saveCurrentFilterPreset() {
    const expression = draftSearch.trim();
    if (!expression) return;
    const name = window.prompt("Preset name", selectedFilterPresetId ? filterPresets.find((preset) => preset.id === selectedFilterPresetId)?.name : "");
    if (!name?.trim()) return;
    const existingId = selectedFilterPresetId || `preset_${Date.now()}`;
    const nextPreset: DisplayFilterPreset = {
      id: existingId,
      name: name.trim(),
      expression,
    };
    const next = [...filterPresets.filter((preset) => preset.id !== existingId), nextPreset].sort((a, b) => a.name.localeCompare(b.name));
    updateFilterPresets(next);
    setSelectedFilterPresetId(nextPreset.id);
  }

  function applyFilterPreset(id: string) {
    setSelectedFilterPresetId(id);
    const preset = filterPresets.find((item) => item.id === id);
    if (preset) setDisplayFilter(preset.expression);
  }

  function deleteSelectedFilterPreset() {
    if (!selectedFilterPresetId) return;
    const preset = filterPresets.find((item) => item.id === selectedFilterPresetId);
    if (!preset) return;
    if (!window.confirm(`Delete filter preset "${preset.name}"?`)) return;
    updateFilterPresets(filterPresets.filter((item) => item.id !== selectedFilterPresetId));
    setSelectedFilterPresetId("");
  }

  function filterTextActive() {
    return draftSearch.trim();
  }

  function currentFilterValid() {
    return draftParsedFilter.valid;
  }

  function currentFilterForAppend() {
    return draftSearch.trim();
  }

  function appliedFilterTextActive() {
    return appliedSearch.trim();
  }

  function filterStatusText() {
    if (!filterTextActive()) return "";
    if (!draftParsedFilter.valid) return draftParsedFilter.error;
    if (filterPending) return "Filtering...";
    return `${filteredRows.length}/${frames.length} frames`;
  }

  function filterStatusClass() {
    if (filterTextActive() && !draftParsedFilter.valid) return "text-destructive";
    if (filterTextActive()) return "text-emerald-600 dark:text-emerald-400";
    return "text-muted-foreground";
  }

  function filterInputClass() {
    if (filterTextActive() && !draftParsedFilter.valid) return "border-destructive focus-visible:ring-destructive";
    if (filterTextActive()) return "border-emerald-500/70 focus-visible:ring-emerald-500";
    return "";
  }

  function filterIconClass() {
    if (filterTextActive() && !draftParsedFilter.valid) return "text-destructive";
    if (filterTextActive()) return "text-emerald-600 dark:text-emerald-400";
    return "text-muted-foreground";
  }

  function noRowsMessage() {
    if (appliedFilterTextActive()) {
      return parsedFilter.valid ? "No frames match the display filter" : parsedFilter.error;
    }
    return connected ? "Waiting for CAN frames from daemon" : "Connect a remote daemon profile or open a candump file";
  }

  function headerCanAppend() {
    return currentFilterValid() && Boolean(currentFilterForAppend());
  }

  function headerInvalidAppendReason() {
    return !currentFilterValid() && currentFilterForAppend();
  }

  function rowClass(row: TraceRow) {
    const { frame, key: rowKey } = row;
    const txStateClass =
      frame.tx_status === "failed"
        ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
        : frame.tx_status === "pending"
          ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
          : frame.tx_status === "sent"
            ? "bg-sky-500/10 hover:bg-sky-500/15"
            : frame.scenario_status
              ? "bg-primary/10 hover:bg-primary/15"
            : "";
    return `cursor-pointer border-b last:border-0 hover:bg-muted/40 ${
      row.hasError ? "bg-destructive/10 text-destructive hover:bg-destructive/15" : ""
    } ${txStateClass} ${rowKey === selectedFrameKey ? "bg-muted" : ""}`;
  }

  function rowContextMenu(event: MouseEvent, row: TraceRow) {
    openCellContextMenu(event, row.frame, row.key, "message", formatCanMessage(row.frame));
  }

  const virtuosoComponents = useMemo<TableComponents<TraceRow>>(
    () => ({
      Scroller: forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>((props, ref) => (
        <div {...props} ref={ref} className="h-full overflow-auto" />
      )),
      Table: (props) => <table {...props} className="w-full table-auto text-left text-sm" />,
      TableHead: forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>((props, ref) => (
        <thead {...props} ref={ref} className="sticky top-0 z-10 border-y bg-background text-xs uppercase text-muted-foreground shadow-sm" />
      )),
      TableRow: ({ item, ...props }) => (
        <tr
          {...props}
          className={rowClass(item)}
          onClick={() => setSelectedFrameKey(item.key)}
          onContextMenu={(event) => rowContextMenu(event, item)}
        />
      ),
      EmptyPlaceholder: () => (
        <tbody>
          <tr>
            <td className="px-4 py-8 text-center text-muted-foreground" colSpan={visibleMonitorColumnCount}>
              {noRowsMessage()}
            </td>
          </tr>
        </tbody>
      ),
    }),
    [appliedSearch, connected, filteredRows.length, frames.length, parsedFilter.error, parsedFilter.valid, selectedFrameKey, visibleMonitorColumnCount],
  );

  function fixedHeaderContent() {
    return <tr>{visibleTraceColumns.map(renderTraceHeader)}</tr>;
  }

  function virtualRowContent(_index: number, row: TraceRow) {
    return visibleTraceColumns.map((column) => renderTraceCell(column, row));
  }

  function copyText(value: string) {
    void navigator.clipboard?.writeText(value);
    setContextMenu(null);
  }

  function stageFrameForTransmit(frame: WsFrame) {
    stageSharedTransmitDraft(frame);
    setTxId(formatCanId(frame.id));
    setTxPayload(formatPayloadBytes(frame.data_hex));
    setTxDlc(String(byteLength(frame.data_hex)));
    setContextMenu(null);
  }

  function stageFrameForSimulator(frame: WsFrame) {
    stageSharedTransmitDraft(frame, "CAN Monitor frame");
    setContextMenu(null);
  }

  function renderTraceHeader(column: TraceColumn) {
    return (
      <th
        key={column.id}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", column.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          moveTraceColumn(event.dataTransfer.getData("text/plain"), column.id);
        }}
        onContextMenu={(event) => openHeaderContextMenu(event, column)}
        className={`cursor-move whitespace-nowrap px-4 py-2 font-medium ${column.id === "line" ? "text-right" : ""}`}
        title="Drag to reorder columns. Right click to build a display filter."
      >
        {column.label}
      </th>
    );
  }

  function renderTraceCell(column: TraceColumn, row: TraceRow) {
    const { frame, key: rowKey, decoded: decodedFrame } = row;
    if (column.kind === "canId") {
      const fieldName = column.id.slice("canId:".length);
      const field = decodedFrame?.canIdFields.find((item) => item.name === fieldName);
      const value = field ? formatDecodedValue(field) : "-";
      return (
        <td key={column.id} className="px-4 py-3 font-mono text-xs" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, column.id, value, field)}>
          {value}
        </td>
      );
    }

    if (column.kind === "payloadHeader") {
      const fieldName = column.id.slice("payload:".length);
      const field = decodedFrame?.payloadFields.find((item) => item.name === fieldName);
      const value = field ? formatDecodedValue(field) : "-";
      return (
        <td key={column.id} className="px-4 py-3 font-mono text-xs" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, column.id, value, field)}>
          {value}
        </td>
      );
    }

    switch (column.id as MonitorColumnId) {
      case "line": {
        const lineNumber = frame.line_no ?? row.numericValues.line;
        return (
          <td
            key={column.id}
            className="px-3 py-3 text-right font-mono text-xs text-muted-foreground"
            onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "line", String(lineNumber))}
          >
            {lineNumber}
          </td>
        );
      }
      case "time":
        return (
          <td key={column.id} className="px-4 py-3 font-mono text-xs" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "time", formatTime(frame.ts_ms))}>
            {formatTime(frame.ts_ms)}
          </td>
        );
      case "iface":
        return (
          <td key={column.id} className="px-4 py-3" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "iface", frame.iface)}>
            {frame.iface}
          </td>
        );
      case "canId":
        return (
          <td key={column.id} className="px-4 py-3 font-mono" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "canId", formatCanId(frame.id))}>
            {formatCanId(frame.id)}
          </td>
        );
      case "dir":
        return (
          <td key={column.id} className="px-4 py-3" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "dir", frame.dir.toUpperCase())}>
            <Badge
              variant={frame.dir === "tx" ? "default" : "secondary"}
              title={frame.tx_status ? `TX ${frame.tx_status}${frame.tx_error ? `: ${frame.tx_error}` : ""}` : undefined}
            >
              {frame.dir.toUpperCase()}
              {frame.tx_status ? `:${frame.tx_status}` : ""}
              {frame.scenario_status ? ` SEQ:${frame.scenario_status}` : ""}
            </Badge>
          </td>
        );
      case "len":
        return (
          <td key={column.id} className="px-4 py-3" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "len", String(byteLength(frame.data_hex)))}>
            {byteLength(frame.data_hex)}
          </td>
        );
      case "mode":
        return (
          <td key={column.id} className="px-4 py-3 text-muted-foreground" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "mode", frame.is_fd ? "CAN-FD" : "Classic")}>
            {frame.is_fd ? "CAN-FD" : "Classic"}
          </td>
        );
      case "payload": {
        const value = showRawPayloadColumn
          ? formatPayloadCell(frame, decodedFrame)
          : formatPayloadValuesCell(frame, decodedFrame, payloadHeaderNames);
        return (
          <td key={column.id} className="max-w-96 truncate px-4 py-3 font-mono text-xs" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "payload", value)}>
            {value}
          </td>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background" tabIndex={0} onKeyDown={handleMonitorKeyDown} onClick={() => {
      setContextMenu(null);
      setHeaderContextMenu(null);
    }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".log,.txt,.candump"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void openCandumpFile(file);
          event.target.value = "";
        }}
      />

      <div
        className={`grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 ${
          showDecodedPreview || showTransmitComposer ? "xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]" : ""
        }`}
      >
        <div className="h-full min-h-0 min-w-0 overflow-hidden">
          <section className="grid h-full min-h-0 min-w-0">
            <Card className="flex min-h-0 min-w-0 flex-col rounded-lg border-border/70 shadow-sm">
              <CardHeader className="flex-row items-center justify-between gap-2 border-b bg-muted/20 p-2.5">
                <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 shrink-0" />
                  <span className="truncate">Frame trace</span>
                </CardTitle>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
                  <Badge
                    variant="outline"
                    className={
                      connected
                        ? "h-8 gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                        : status === "connecting"
                          ? "h-8 gap-1 border-sky-500/40 text-sky-600 dark:text-sky-400"
                          : status === "error"
                            ? "h-8 gap-1 border-destructive/40 text-destructive"
                        : "h-8 gap-1 border-muted-foreground/40 text-muted-foreground"
                    }
                  >
                    <span className={connected ? "h-2 w-2 rounded-full bg-emerald-500" : "h-2 w-2 rounded-full bg-muted-foreground"} />
                    {connectionLabel}
                  </Badge>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => fileInputRef.current?.click()}>
                    <FileUp className="h-4 w-4" />
                    Open
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={!frames.length} title="Export raw candump log" onClick={exportCandumpLog}>
                    <Download className="h-4 w-4" />
                    Log
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={!filteredRows.length} title="Export current decoded table view as CSV" onClick={exportVisibleCsv}>
                    <Download className="h-4 w-4" />
                    CSV
                  </Button>
                  {connected ? (
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => void disconnect()}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={openConnectionManager}>
                      <Cable className="h-4 w-4" />
                      Connect
                    </Button>
                  )}
                  <TraceColumnMenu
                    canIdColumns={dynamicCanIdColumns}
                    payloadColumns={dynamicPayloadColumns}
                  />
                  <Button
                    variant={showDecodedPreview ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setShowDecodedPreview(!showDecodedPreview)}
                    title={showDecodedPreview ? "Hide decoded preview" : "Show decoded preview"}
                  >
                    {showDecodedPreview ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    Decode
                  </Button>
                  <Button
                    variant={showTransmitComposer ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setShowTransmitComposer(!showTransmitComposer)}
                    title={showTransmitComposer ? "Hide transmit composer" : "Show transmit composer"}
                  >
                    {showTransmitComposer ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    TX
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearFrames}>
                    <Trash2 className="h-4 w-4" />
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!connected}
                    title={capturePaused ? "Resume capture" : "Pause capture"}
                    onClick={() => void (capturePaused ? resumeCapture() : pauseCapture())}
                  >
                    {capturePaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>
              <div className="border-b border-sky-500/20 bg-sky-500/10 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:bg-sky-400/10">
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search
                      className={`pointer-events-none absolute left-3 top-2.5 h-4 w-4 ${filterIconClass()}`}
                    />
                    <Input
                      value={draftSearch}
                      onChange={(event) => setDisplayFilter(event.target.value)}
                      className={`h-9 pl-9 ${draftSearch ? "pr-9" : ""} font-mono text-xs ${filterInputClass()}`}
                      placeholder='Display filter: canId == 18203C01 and message_good == good'
                      title="Use bare text or field filters: canId == 18203C01, len >= 8, payload contains 01, command_class == response"
                    />
                    {draftSearch && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0.5 top-0.5 h-8 w-8 text-muted-foreground hover:text-foreground"
                        title="Clear display filter"
                        onClick={clearDisplayFilter}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Open display filter help" onClick={openDisplayFilterHelp}>
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                  <Select value={selectedFilterPresetId || "__none"} onValueChange={(value) => value === "__none" ? setSelectedFilterPresetId("") : applyFilterPreset(value)}>
                    <SelectTrigger className="h-9 w-40 shrink-0 text-xs">
                      <SelectValue placeholder="Presets" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Filter presets</SelectItem>
                      {filterPresets.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 shrink-0 px-2 text-xs"
                    disabled={!draftSearch.trim()}
                    title="Save current display filter as a preset"
                    onClick={saveCurrentFilterPreset}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 shrink-0 px-2 text-xs"
                    disabled={!selectedFilterPresetId}
                    title="Delete selected filter preset"
                    onClick={deleteSelectedFilterPreset}
                  >
                    Delete
                  </Button>
                </div>
                <div
                  className={`mt-1 text-[11px] ${filterStatusClass()}`}
                >
                  {filterStatusText()}
                </div>
              </div>
              <div className="border-b bg-muted/20 px-3 py-2">
                <div className="grid gap-2 text-xs md:grid-cols-[repeat(6,minmax(0,1fr))]">
                  {[
                    ["Frames", traceStats.total],
                    ["RX", traceStats.rx],
                    ["TX", traceStats.tx],
                    ["Decoded errors", traceStats.errors],
                    ["TX failed", traceStats.txFailed],
                    ["Unique IDs", traceStats.uniqueIds],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border bg-background px-2 py-1.5">
                      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
                      <div className="mt-0.5 font-mono text-sm font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
                {traceStats.topIds.length > 0 && (
                  <div className="mt-2 grid gap-1 md:grid-cols-5">
                    {traceStats.topIds.map(([id, count]) => {
                      const width = traceStats.total ? Math.max(4, Math.round((count / traceStats.total) * 100)) : 0;
                      return (
                        <div key={id} className="min-w-0">
                          <div className="mb-1 flex justify-between gap-2 font-mono text-[11px]">
                            <span className="truncate">{id}</span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted">
                            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <CardContent className="min-h-0 min-w-0 flex-1 p-0">
                <TableVirtuoso
                  ref={tableVirtuosoRef}
                  className="h-full"
                  data={filteredRows}
                  components={virtuosoComponents}
                  computeItemKey={(_index, row) => row.key}
                  fixedHeaderContent={fixedHeaderContent}
                  itemContent={virtualRowContent}
                  defaultItemHeight={45}
                  followOutput={status === "connected" && !traceSourceName ? "smooth" : false}
                />
              </CardContent>
            </Card>
          </section>
        </div>

        {(showDecodedPreview || showTransmitComposer) && (
        <aside className="min-w-0 flex min-h-0 flex-col gap-3 overflow-hidden">
          {showDecodedPreview && (
          <Card className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border-border/70 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Gauge className="h-4 w-4" />
                  Decoded preview
                </CardTitle>
                <DecodedPreviewColumnMenu />
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto p-3 pt-0">
              <DecodedPreviewPanel
                decoded={selectedDecodedFrame}
                emptyText="Load a profile and select or import frames to decode."
                onOpenMessage={(decoded) => openDecodedInProfile(decoded, selectedFrame)}
                onOpenField={(field, decoded) => openDecodedInProfile(decoded, selectedFrame, field)}
              />
            </CardContent>
          </Card>
          )}

          {showTransmitComposer && (
          <Card className="min-w-0 shrink-0 rounded-lg border-border/70 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <RadioTower className="h-4 w-4" />
                  Transmit composer
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Open transmit composer help" onClick={openTransmitComposerHelp}>
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <Tabs defaultValue="single">
                <TabsList className="grid w-full grid-cols-2 rounded-md">
                  <TabsTrigger value="single">Single frame</TabsTrigger>
                  <TabsTrigger value="cycle">Cyclic TX</TabsTrigger>
                </TabsList>
                <TabsContent value="single" className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs font-medium">
                      CAN ID
                      <Input value={txId} onChange={(event) => setTxId(event.target.value)} />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      DLC
                      <Select value={txDlc} onValueChange={setTxDlc}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0 bytes</SelectItem>
                          <SelectItem value="1">1 byte</SelectItem>
                          <SelectItem value="2">2 bytes</SelectItem>
                          <SelectItem value="3">3 bytes</SelectItem>
                          <SelectItem value="4">4 bytes</SelectItem>
                          <SelectItem value="5">5 bytes</SelectItem>
                          <SelectItem value="6">6 bytes</SelectItem>
                          <SelectItem value="7">7 bytes</SelectItem>
                          <SelectItem value="8">8 bytes</SelectItem>
                          <SelectItem value="12">12 bytes</SelectItem>
                          <SelectItem value="20">20 bytes</SelectItem>
                          <SelectItem value="24">24 bytes</SelectItem>
                          <SelectItem value="16">16 bytes</SelectItem>
                          <SelectItem value="32">32 bytes</SelectItem>
                          <SelectItem value="48">48 bytes</SelectItem>
                          <SelectItem value="64">64 bytes</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                  <label className="space-y-1 text-xs font-medium">
                    Payload
                    <Input className="font-mono" value={txPayload} onChange={(event) => setTxPayload(event.target.value)} />
                  </label>
                  <label className="space-y-1 text-xs font-medium">
                    Retry on daemon/interface error
                    <Select value={txRetryCount} onValueChange={setTxRetryCount}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">No retry</SelectItem>
                        <SelectItem value="1">Retry once</SelectItem>
                        <SelectItem value="2">Retry twice</SelectItem>
                        <SelectItem value="3">Retry 3 times</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <span className="block" title={txDisabledReason}>
                    <Button className="w-full" disabled={!connected} onClick={() => void sendCurrentFrame()}>
                      <Send className="h-4 w-4" />
                      Send Frame
                    </Button>
                  </span>
                </TabsContent>
                <TabsContent value="cycle" className="space-y-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                    <label className="space-y-1 text-xs font-medium">
                      Period
                      <Input value={cyclicPeriod} onChange={(event) => setCyclicPeriod(event.target.value)} />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      Unit
                      <Select value={cyclicUnit} onValueChange={(value) => setCyclicUnit(value as "ms" | "s")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ms">ms</SelectItem>
                          <SelectItem value="s">s</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                  <label className="space-y-1 text-xs font-medium">
                    Send mode
                    <Select value={cyclicMode} onValueChange={(value) => setCyclicMode(value as "fire-and-forget" | "wait-ack" | "wait-response")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fire-and-forget">Fire and forget</SelectItem>
                        <SelectItem value="wait-ack">Wait for daemon ACK</SelectItem>
                        <SelectItem value="wait-response">Wait for CAN response</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  {cyclicMode === "wait-response" && (
                    <div className="grid gap-2">
                      <label className="space-y-1 text-xs font-medium">
                        Expected response
                        <Select value={cyclicExpectedResponse} onValueChange={setCyclicExpectedResponse}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any_rx">Any RX frame on selected interface</SelectItem>
                            {expectedResponseOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="space-y-1 text-xs font-medium">
                        Response timeout ms
                        <Input value={cyclicResponseTimeout} onChange={(event) => setCyclicResponseTimeout(event.target.value)} />
                      </label>
                    </div>
                  )}
                  <label className="space-y-1 text-xs font-medium">
                    If ACK/response is later than period
                    <Select value={cyclicLatePolicy} onValueChange={(value) => setCyclicLatePolicy(value as "send-anyway" | "skip" | "stop")} disabled={cyclicMode === "fire-and-forget"}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">Skip missed period</SelectItem>
                        <SelectItem value="send-anyway">Send next immediately</SelectItem>
                        <SelectItem value="stop">Stop cyclic TX</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <span className="block" title={cyclicDisabledReason}>
                    <Button variant={cyclicActive ? "destructive" : "outline"} className="w-full" disabled={!connected && !cyclicActive} onClick={cyclicActive ? stopCyclicTx : startCyclicTx}>
                      {cyclicActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {cyclicActive ? "Stop cyclic TX" : "Start cyclic TX"}
                    </Button>
                  </span>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          )}
        </aside>
        )}
      </div>

      {headerContextMenu && (
        <div
          className="fixed z-50 w-72 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
          style={{ left: headerContextMenu.x, top: headerContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-2 py-1.5">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Display filter column</div>
            <div className="mt-0.5 truncate font-mono text-xs">{filterFieldForColumn(headerContextMenu.column)}</div>
          </div>
          <div className="my-1 border-t" />
          {(() => {
            const selectedValue = selectedValueForColumn(headerContextMenu.column);
            const canAppend = headerCanAppend();
            return (
              <>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={selectedValue == null}
                  onClick={() => selectedValue != null && applyColumnFilter(headerContextMenu.column, "replace", selectedValue)}
                >
                  <span>Replace with selected value</span>
                  <span className="max-w-28 truncate font-mono text-xs text-muted-foreground">{selectedValue ?? "No row"}</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={selectedValue == null || !canAppend}
                  onClick={() => selectedValue != null && applyColumnFilter(headerContextMenu.column, "and", selectedValue)}
                >
                  Add AND selected value
                </button>
                <button
                  type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={selectedValue == null || !canAppend}
                  onClick={() => selectedValue != null && applyColumnFilter(headerContextMenu.column, "or", selectedValue)}
                >
                  Add OR selected value
                </button>
                <div className="my-1 border-t" />
                <button
                  type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => applyColumnFilter(headerContextMenu.column, "replace")}
                >
                  Start editable condition
                </button>
                <button
                  type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canAppend}
                  onClick={() => applyColumnFilter(headerContextMenu.column, "and")}
                >
                  Add AND editable condition
                </button>
                <button
                  type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canAppend}
                  onClick={() => applyColumnFilter(headerContextMenu.column, "or")}
                >
                  Add OR editable condition
                </button>
                {currentFilterForAppend() && (
                  <>
                    <div className="my-1 border-t" />
                    <button
                      type="button"
                      className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
                      onClick={clearDisplayFilter}
                    >
                      Clear display filter
                    </button>
                  </>
                )}
                {headerInvalidAppendReason() && (
                  <div className="mt-1 rounded-sm bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                    Fix the current filter before appending with AND or OR.
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 min-w-56 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => copyText(contextMenu.value)}
          >
            Copy Value
          </button>
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => copyText(formatCanMessage(contextMenu.frame))}
          >
            Copy CAN Message
          </button>
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => copyText(formatCandumpLine(contextMenu.frame))}
          >
            Copy candump Line
          </button>
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => stageFrameForTransmit(contextMenu.frame)}
          >
            Use in Transmit Composer
          </button>
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => stageFrameForSimulator(contextMenu.frame)}
          >
            Copy to Simulator TX
          </button>
          <div className="my-1 border-t" />
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => defineMessageStructure(contextMenu.frame)}
          >
            Define Message Structure
          </button>
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              editFrameFromTrace(contextMenu.frame);
              setContextMenu(null);
            }}
          >
            Use as Decode Preview
          </button>
        </div>
      )}
    </div>
  );
}
