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
import { loadedTracePageSizes, monitorColumnLabels, MonitorColumnId, useMonitorPreferencesStore } from "@/store/monitorPreferencesStore";
import { resolveProfileReferences, useProfileStore } from "@/profile-editor/store/profileStore";
import { DecodedField, DecodedFrame, decodeFrameWithProfiles } from "@/profile-editor/decodeProfile";
import { DecodedPreviewColumnMenu, DecodedPreviewPanel } from "@/profile-editor/DecodedPreviewPanel";
import { parseCandump } from "@/can/candump";
import { Activity, ArrowDown, ArrowUp, Cable, Columns3, Eye, EyeOff, FileDown, FileSpreadsheet, FolderOpen, BellPlus, Gauge, HelpCircle, Pause, Play, RadioTower, Search, Send, Trash2, Unplug, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { forwardRef, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { HTMLAttributes, KeyboardEvent, MouseEvent } from "react";
import { TableVirtuoso } from "react-virtuoso";
import type { TableComponents, TableVirtuosoHandle } from "react-virtuoso";
import type { WsFrame } from "@/can-bridge/ws/types";
import type { ProfileDocument } from "@/profile-editor/model/profile";
import { toast } from "sonner";

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

const defaultColumnWidths: Record<string, number> = {
  line: 68,
  time: 110,
  iface: 72,
  canId: 88,
  dir: 60,
  len: 54,
  mode: 72,
  payload: 180,
};

function getColumnBaseWidth(column: TraceColumn): number {
  if (column.kind === "static" && defaultColumnWidths[column.id]) {
    return defaultColumnWidths[column.id];
  }
  return Math.max(80, column.label.length * 9 + 40);
}

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

function uniqueProfiles(profiles: Array<ProfileDocument | null>) {
  const seen = new Set<ProfileDocument>();
  return profiles.filter((profile): profile is ProfileDocument => {
    if (!profile || seen.has(profile)) return false;
    seen.add(profile);
    return true;
  });
}

function profileCanIdColumns(profile: ProfileDocument) {
  return profile.layouts.canId.fields.map((field) => ({
    id: `canId:${field.name}`,
    label: field.name,
  }));
}

function profilePayloadColumns(profile: ProfileDocument) {
  const names = new Set<string>();
  for (const field of profile.layouts.payloadHeader?.fields ?? []) names.add(field.name);

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
  if (!decoded?.payloadDecodedFields.length) return frame.data_hex;
  return decoded.payloadDecodedFields.map((field) => `${field.name}=${formatDecodedValue(field)}`).join(", ");
}

function formatPayloadValuesCell(frame: WsFrame, decoded: DecodedFrame | null | undefined, headerNames: Set<string>) {
  if (decoded?.errorCode != null || decoded?.messageGood === false) {
    return `Error${decoded.errorCode != null ? ` ${decoded.errorCode}` : ""}: ${decoded.errorText ?? "Unknown error"}`;
  }
  const fields = (decoded?.payloadDecodedFields ?? []).filter((field) => !headerNames.has(field.name));
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
  for (const field of decoded?.payloadDecodedFields ?? []) {
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

type SortDirection = "asc" | "desc";

type MonitorSortRule = {
  id: string;
  columnId: string;
  label: string;
  direction: SortDirection;
};

type MonitorSortPreset = {
  id: string;
  name: string;
  rules: MonitorSortRule[];
};

type MonitorAlertRule = {
  id: string;
  name: string;
  expression: string;
  enabled: boolean;
};

const DISPLAY_FILTER_PRESETS_KEY = "cansim.monitor.filterPresets.v1";
const MONITOR_SORT_PRESETS_KEY = "cansim.monitor.sortPresets.v1";
const MONITOR_SORT_RULES_KEY = "cansim.monitor.sortRules.v1";
const MONITOR_ALERT_RULES_KEY = "cansim.monitor.alertRules.v1";

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

function validSortRule(rule: MonitorSortRule) {
  return Boolean(rule.columnId && rule.label && (rule.direction === "asc" || rule.direction === "desc"));
}

function loadMonitorSortRules(): MonitorSortRule[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MONITOR_SORT_RULES_KEY) ?? "[]") as MonitorSortRule[];
    return Array.isArray(parsed) ? parsed.filter(validSortRule) : [];
  } catch {
    return [];
  }
}

function saveMonitorSortRules(rules: MonitorSortRule[]) {
  localStorage.setItem(MONITOR_SORT_RULES_KEY, JSON.stringify(rules));
}

function loadMonitorSortPresets(): MonitorSortPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MONITOR_SORT_PRESETS_KEY) ?? "[]") as MonitorSortPreset[];
    return Array.isArray(parsed)
      ? parsed
          .filter((preset) => preset.name && Array.isArray(preset.rules))
          .map((preset) => ({ ...preset, rules: preset.rules.filter(validSortRule) }))
          .filter((preset) => preset.rules.length > 0)
      : [];
  } catch {
    return [];
  }
}

function saveMonitorSortPresets(presets: MonitorSortPreset[]) {
  localStorage.setItem(MONITOR_SORT_PRESETS_KEY, JSON.stringify(presets));
}

function loadMonitorAlertRules(): MonitorAlertRule[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MONITOR_ALERT_RULES_KEY) ?? "[]") as MonitorAlertRule[];
    return Array.isArray(parsed) ? parsed.filter((rule) => rule.name && rule.expression) : [];
  } catch {
    return [];
  }
}

function saveMonitorAlertRules(rules: MonitorAlertRule[]) {
  localStorage.setItem(MONITOR_ALERT_RULES_KEY, JSON.stringify(rules));
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

function sortFieldForColumn(columnId: string) {
  return columnId;
}

function compareRowsByRule(a: TraceRow, b: TraceRow, rule: MonitorSortRule) {
  const fieldName = sortFieldForColumn(rule.columnId);
  const left = getRowField(a, fieldName);
  const right = getRowField(b, fieldName);
  const direction = rule.direction === "asc" ? 1 : -1;

  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  if (left.numeric != null && right.numeric != null && left.numeric !== right.numeric) {
    return (left.numeric - right.numeric) * direction;
  }

  const textCompare = left.value.localeCompare(right.value, undefined, { numeric: true, sensitivity: "base" });
  return textCompare * direction;
}

function sortTraceRows(rows: TraceRow[], rules: MonitorSortRule[]) {
  if (!rules.length) return rows;
  return [...rows].sort((a, b) => {
    for (const rule of rules) {
      const result = compareRowsByRule(a, b, rule);
      if (result !== 0) return result;
    }
    return a.numericValues.line - b.numericValues.line;
  });
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
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Columns3 className="h-4 w-4" />
              <span className="sr-only">Columns</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Columns</p>
        </TooltipContent>
      </Tooltip>
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
    () => uniqueProfiles([rawProfileForDecode, ...loadedProfileLibrary]).map((profile) => resolveProfileReferences(profile) ?? profile),
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
  const loadedPageSize = useMonitorPreferencesStore((s) => s.loadedPageSize);
  const loadedPageIndex = useMonitorPreferencesStore((s) => s.loadedPageIndex);
  const setLoadedPageSize = useMonitorPreferencesStore((s) => s.setLoadedPageSize);
  const setLoadedPageIndex = useMonitorPreferencesStore((s) => s.setLoadedPageIndex);
  const showDecodedPreview = useMonitorPreferencesStore((s) => s.showDecodedPreview);
  const setShowDecodedPreview = useMonitorPreferencesStore((s) => s.setShowDecodedPreview);
  const showTransmitComposer = useMonitorPreferencesStore((s) => s.showTransmitComposer);
  const setShowTransmitComposer = useMonitorPreferencesStore((s) => s.setShowTransmitComposer);
  const selectedFrameKey = useMonitorPreferencesStore((s) => s.selectedTraceRowKey ?? null);
  const setSelectedFrameKey = useMonitorPreferencesStore((s) => s.setSelectedTraceRowKey);
  const tableVirtuosoRef = useRef<TableVirtuosoHandle>(null);
  const cyclicTimerRef = useRef<number | null>(null);
  const cyclicRunningRef = useRef(false);
  const lastAlertedLineRef = useRef(0);
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
  const [sortRules, setSortRules] = useState<MonitorSortRule[]>(loadMonitorSortRules);
  const [sortPresets, setSortPresets] = useState<MonitorSortPreset[]>(loadMonitorSortPresets);
  const [selectedSortPresetId, setSelectedSortPresetId] = useState("");
  const [alertRules, setAlertRules] = useState<MonitorAlertRule[]>(loadMonitorAlertRules);
  const lastTraceSourceNameRef = useRef<string | undefined>(traceSourceName);
  const [columnMinWidths, setColumnMinWidths] = useState<Record<string, number>>({});

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

  useEffect(() => {
    if (!traceRows.length) {
      setColumnMinWidths({});
      return;
    }

    setColumnMinWidths((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const column of visibleTraceColumns) {
        const baseWidth = getColumnBaseWidth(column);
        let maxObserved = prev[column.id] ?? baseWidth;

        for (let i = 0; i < traceRows.length; i++) {
          const row = traceRows[i];
          let cellText = "";
          if (column.kind === "canId") {
            const fieldName = column.id.slice("canId:".length);
            const field = row.decoded?.canIdFields.find((item) => item.name === fieldName);
            cellText = field ? formatDecodedValue(field) : "-";
          } else if (column.kind === "payloadHeader") {
            const fieldName = column.id.slice("payload:".length);
            const field = row.decoded?.payloadDecodedFields.find((item) => item.name === fieldName);
            cellText = field ? formatDecodedValue(field) : "-";
          } else {
            cellText = row.values[column.id] ?? "";
          }

          const required = Math.max(baseWidth, cellText.length * 8 + 32);
          if (required > maxObserved) {
            maxObserved = required;
          }
        }

        maxObserved = Math.min(800, maxObserved);

        if (prev[column.id] !== maxObserved) {
          next[column.id] = maxObserved;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [traceRows, visibleTraceColumns]);

  const filteredRows = useMemo(() => traceRows.filter((row) => rowMatchesFilter(row, parsedFilter)), [parsedFilter, traceRows]);
  const sortedRows = useMemo(() => sortTraceRows(filteredRows, sortRules), [filteredRows, sortRules]);
  const loadedTracePaginationEnabled = Boolean(traceSourceName);
  const loadedTracePageCount = loadedTracePaginationEnabled ? Math.max(1, Math.ceil(sortedRows.length / loadedPageSize)) : 1;
  const safeLoadedPageIndex = loadedTracePaginationEnabled ? Math.min(loadedPageIndex, loadedTracePageCount - 1) : 0;
  const pageStartIndex = loadedTracePaginationEnabled ? safeLoadedPageIndex * loadedPageSize : 0;
  const pageEndIndex = loadedTracePaginationEnabled ? Math.min(pageStartIndex + loadedPageSize, sortedRows.length) : sortedRows.length;
  const visibleRows = useMemo(
    () => (loadedTracePaginationEnabled ? sortedRows.slice(pageStartIndex, pageEndIndex) : sortedRows),
    [loadedTracePaginationEnabled, pageEndIndex, pageStartIndex, sortedRows],
  );

  useEffect(() => {
    if (!loadedTracePaginationEnabled) return;
    if (loadedPageIndex > loadedTracePageCount - 1) setLoadedPageIndex(loadedTracePageCount - 1);
  }, [loadedPageIndex, loadedTracePageCount, loadedTracePaginationEnabled, setLoadedPageIndex]);

  useEffect(() => {
    if (traceSourceName && traceSourceName !== lastTraceSourceNameRef.current) {
      setLoadedPageIndex(0);
    }
    lastTraceSourceNameRef.current = traceSourceName;
  }, [setLoadedPageIndex, traceSourceName]);

  useEffect(() => {
    if (!loadedTracePaginationEnabled) return;
    tableVirtuosoRef.current?.scrollToIndex({ index: 0, align: "start" });
    if (visibleRows.length && !visibleRows.some((row) => row.key === selectedFrameKey)) {
      setSelectedFrameKey(visibleRows[0].key);
    }
  }, [loadedPageSize, loadedTracePaginationEnabled, safeLoadedPageIndex, selectedFrameKey, setSelectedFrameKey, visibleRows]);

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
      for (const message of profile.messages) {
        const commandClass = message.identifyBy.command_class;
        const messageText = `${message.id} ${message.label}`.toLowerCase();
        if (commandClass != null && !["3", "5", "response", "event", "event/notification"].includes(String(commandClass)) && !messageText.includes("response") && !messageText.includes("event")) {
          continue;
        }
        byId.set(message.id, message.label ?? message.id);
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

  useEffect(() => {
    const enabledRules = alertRules.filter((rule) => rule.enabled);
    if (!enabledRules.length || !traceRows.length) {
      lastAlertedLineRef.current = Math.max(lastAlertedLineRef.current, traceRows[traceRows.length - 1]?.frame.line_no ?? 0);
      return;
    }

    const newRows = traceRows.filter((row) => (row.frame.line_no ?? 0) > lastAlertedLineRef.current);
    if (!newRows.length) return;

    for (const row of newRows) {
      for (const rule of enabledRules) {
        const parsed = parseFilter(rule.expression);
        if (!parsed.valid || !rowMatchesFilter(row, parsed)) continue;
        toast.warning(rule.name, {
          description: `${formatCanId(row.frame.id)} ${formatPayloadBytes(row.frame.data_hex)}`.trim(),
        });
      }
    }
    lastAlertedLineRef.current = Math.max(lastAlertedLineRef.current, newRows[newRows.length - 1]?.frame.line_no ?? lastAlertedLineRef.current);
  }, [alertRules, traceRows]);

  const selectedFrame = useMemo(() => {
    if (!selectedFrameKey) return undefined;
    return sortedRows.find((row) => row.key === selectedFrameKey)?.frame;
  }, [selectedFrameKey, sortedRows]);

  const selectedTraceRow = useMemo(() => {
    if (!selectedFrameKey) return null;
    return traceRows.find((row) => row.key === selectedFrameKey) ?? null;
  }, [selectedFrameKey, traceRows]);

  useEffect(() => {
    if (selectedFrameKey) {
      const row = traceRows.find((r) => r.key === selectedFrameKey);
      if (row) {
        const frame = row.frame;
        setTxId(formatCanId(frame.id));
        setTxPayload(formatPayloadBytes(frame.data_hex));
        setTxDlc(String(byteLength(frame.data_hex)));
        stageSharedTransmitDraft(frame);
      }
    }
  }, [selectedFrameKey, traceRows, stageSharedTransmitDraft]);

  const selectedDecodedFrame = useMemo(() => {
    const frame = selectedFrame;
    return frame ? decodeFrameWithProfiles(profilesForDecode, frame) : null;
  }, [profilesForDecode, selectedFrame]);

  const connected = status === "connected";
  const activeIface = subscribedIfaces[0] ?? activeProfile?.iface ?? "vcan0";
  const txDisabledReason = connected ? undefined : "Connect to a CAN interface or remote bridge before sending frames.";
  const cyclicDisabledReason = cyclicActive ? undefined : txDisabledReason;
  const visibleMonitorColumnCount =
    visibleTraceColumns.length;
  const keyboardRows = loadedTracePaginationEnabled ? visibleRows : sortedRows;

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
    if (!keyboardRows.length) return;
    const nextIndex = Math.max(0, Math.min(keyboardRows.length - 1, index));
    const nextRow = keyboardRows[nextIndex];
    setSelectedFrameKey(nextRow.key);
    tableVirtuosoRef.current?.scrollToIndex({ index: nextIndex, align: "center" });
  }

  function handleMonitorKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (shouldIgnoreNavigationKey(event)) return;
    const selectedIndex = Math.max(0, keyboardRows.findIndex((row) => row.key === selectedFrameKey));
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
      selectTraceRowAt(keyboardRows.length - 1);
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
    const rows = sortedRows.map((row) =>
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
      const ownerIndex = loadedProfileLibrary.findIndex((profile) => profile.messages.some((message) => message.id === decoded.frameName));
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

  function updateSortRules(next: MonitorSortRule[]) {
    setSortRules(next);
    saveMonitorSortRules(next);
  }

  function updateSortPresets(next: MonitorSortPreset[]) {
    setSortPresets(next);
    saveMonitorSortPresets(next);
  }

  function makeSortRule(column: TraceColumn, direction: SortDirection): MonitorSortRule {
    return {
      id: `${column.id}_${Date.now()}`,
      columnId: column.id,
      label: column.label,
      direction,
    };
  }

  function applyColumnSort(column: TraceColumn, direction: SortDirection, mode: "replace" | "add") {
    const rule = makeSortRule(column, direction);
    const next = mode === "replace" ? [rule] : [...sortRules.filter((item) => item.columnId !== column.id), rule];
    updateSortRules(next);
    setSelectedSortPresetId("");
    setHeaderContextMenu(null);
  }

  function clearSortRules() {
    updateSortRules([]);
    setSelectedSortPresetId("");
    setHeaderContextMenu(null);
  }

  function removeSortRule(id: string) {
    updateSortRules(sortRules.filter((rule) => rule.id !== id));
    setSelectedSortPresetId("");
  }

  function moveSortRule(id: string, direction: "up" | "down") {
    const index = sortRules.findIndex((rule) => rule.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= sortRules.length) return;
    const next = [...sortRules];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    updateSortRules(next);
    setSelectedSortPresetId("");
  }

  function flipSortRule(id: string) {
    updateSortRules(sortRules.map((rule) => (rule.id === id ? { ...rule, direction: rule.direction === "asc" ? "desc" : "asc" } : rule)));
    setSelectedSortPresetId("");
  }

  function saveCurrentSortPreset() {
    if (!sortRules.length) return;
    const name = window.prompt("Sort preset name", selectedSortPresetId ? sortPresets.find((preset) => preset.id === selectedSortPresetId)?.name : "");
    if (!name?.trim()) return;
    const existingId = selectedSortPresetId || `sort_${Date.now()}`;
    const nextPreset: MonitorSortPreset = {
      id: existingId,
      name: name.trim(),
      rules: sortRules,
    };
    const next = [...sortPresets.filter((preset) => preset.id !== existingId), nextPreset].sort((a, b) => a.name.localeCompare(b.name));
    updateSortPresets(next);
    setSelectedSortPresetId(nextPreset.id);
  }

  function applySortPreset(id: string) {
    setSelectedSortPresetId(id);
    const preset = sortPresets.find((item) => item.id === id);
    if (preset) updateSortRules(preset.rules);
  }

  function deleteSelectedSortPreset() {
    if (!selectedSortPresetId) return;
    const preset = sortPresets.find((item) => item.id === selectedSortPresetId);
    if (!preset) return;
    if (!window.confirm(`Delete sort preset "${preset.name}"?`)) return;
    updateSortPresets(sortPresets.filter((item) => item.id !== selectedSortPresetId));
    setSelectedSortPresetId("");
  }

  function updateAlertRules(next: MonitorAlertRule[]) {
    setAlertRules(next);
    saveMonitorAlertRules(next);
  }

  function addAlertRuleFromCurrentFilter() {
    if (alertRules.length >= 5) {
      window.alert("Maximum of 5 alert rules allowed. Delete an existing rule to add a new one.");
      return;
    }
    const expression = draftSearch.trim();
    if (!expression) return;
    const parsed = parseFilter(expression);
    if (!parsed.valid) {
      window.alert(parsed.error || "The current display filter is not valid.");
      return;
    }
    const name = window.prompt("Alert rule name", "CAN alert");
    if (!name?.trim()) return;
    updateAlertRules([
      ...alertRules,
      {
        id: `alert_${Date.now()}`,
        name: name.trim(),
        expression,
        enabled: true,
      },
    ]);
  }

  function toggleAlertRule(id: string) {
    updateAlertRules(alertRules.map((rule) => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule)));
  }

  function deleteAlertRule(id: string) {
    const rule = alertRules.find((item) => item.id === id);
    if (!rule) return;
    if (!window.confirm(`Delete alert rule "${rule.name}"?`)) return;
    updateAlertRules(alertRules.filter((item) => item.id !== id));
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
      Table: (props) => (
        <table {...props} className="w-full table-auto text-left text-sm">
          <colgroup>
            {visibleTraceColumns.map((col) => {
              const width = columnMinWidths[col.id] ?? getColumnBaseWidth(col);
              return <col key={col.id} style={{ minWidth: `${width}px`, width: `${width}px` }} />;
            })}
          </colgroup>
          {props.children}
        </table>
      ),
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
    [appliedSearch, columnMinWidths, connected, filteredRows.length, frames.length, parsedFilter.error, parsedFilter.valid, selectedFrameKey, visibleMonitorColumnCount, visibleTraceColumns],
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
    const sortIndex = sortRules.findIndex((rule) => rule.columnId === column.id);
    const sortRule = sortIndex >= 0 ? sortRules[sortIndex] : undefined;
    const width = columnMinWidths[column.id] ?? getColumnBaseWidth(column);
    return (
      <th
        key={column.id}
        draggable
        style={{ minWidth: `${width}px` }}
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
        <span className="inline-flex items-center gap-1">
          {column.label}
          {sortRule && (
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
              {sortRule.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {sortIndex + 1}
            </span>
          )}
        </span>
      </th>
    );
  }

  function renderTraceCell(column: TraceColumn, row: TraceRow) {
    const { frame, key: rowKey, decoded: decodedFrame } = row;
    const width = columnMinWidths[column.id] ?? getColumnBaseWidth(column);
    const cellStyle = { minWidth: `${width}px` };

    if (column.kind === "canId") {
      const fieldName = column.id.slice("canId:".length);
      const field = decodedFrame?.canIdFields.find((item) => item.name === fieldName);
      const value = field ? formatDecodedValue(field) : "-";
      return (
        <td key={column.id} style={cellStyle} className="px-4 py-3 font-mono text-xs" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, column.id, value, field)}>
          {value}
        </td>
      );
    }

    if (column.kind === "payloadHeader") {
      const fieldName = column.id.slice("payload:".length);
      const field = decodedFrame?.payloadDecodedFields.find((item) => item.name === fieldName);
      const value = field ? formatDecodedValue(field) : "-";
      return (
        <td key={column.id} style={cellStyle} className="px-4 py-3 font-mono text-xs" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, column.id, value, field)}>
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
            style={cellStyle}
            className="px-3 py-3 text-right font-mono text-xs text-muted-foreground"
            onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "line", String(lineNumber))}
          >
            {lineNumber}
          </td>
        );
      }
      case "time":
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 font-mono text-xs" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "time", formatTime(frame.ts_ms))}>
            {formatTime(frame.ts_ms)}
          </td>
        );
      case "iface":
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "iface", frame.iface)}>
            {frame.iface}
          </td>
        );
      case "canId":
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 font-mono" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "canId", formatCanId(frame.id))}>
            {formatCanId(frame.id)}
          </td>
        );
      case "dir":
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "dir", frame.dir.toUpperCase())}>
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
          <td key={column.id} style={cellStyle} className="px-4 py-3" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "len", String(byteLength(frame.data_hex)))}>
            {byteLength(frame.data_hex)}
          </td>
        );
      case "mode":
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-muted-foreground" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "mode", frame.is_fd ? "CAN-FD" : "Classic")}>
            {frame.is_fd ? "CAN-FD" : "Classic"}
          </td>
        );
      case "payload": {
        const value = showRawPayloadColumn
          ? formatPayloadCell(frame, decodedFrame)
          : formatPayloadValuesCell(frame, decodedFrame, payloadHeaderNames);
        return (
          <td key={column.id} style={cellStyle} className="max-w-96 truncate px-4 py-3 font-mono text-xs" onContextMenu={(event) => openCellContextMenu(event, frame, rowKey, "payload", value)}>
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
        className={`grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-2 sm:p-3 xl:overflow-hidden ${
          showDecodedPreview || showTransmitComposer ? "xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]" : ""
        }`}
      >
        <div className="min-h-[65vh] min-w-0 overflow-hidden xl:h-full xl:min-h-0">
          <section className="grid h-full min-h-0 min-w-0">
            <Card className="flex min-h-0 min-w-0 flex-col rounded-lg border-border/70 shadow-sm">
              <CardHeader className="flex-row items-center justify-between gap-2 border-b bg-muted/20 p-2.5">
                <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 shrink-0" />
                  <span className="truncate">Frame trace</span>
                </CardTitle>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-block">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()}>
                          <FolderOpen className="h-4 w-4" />
                          <span className="sr-only">Open log file</span>
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Open candump log file (.log, .txt, .candump)</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-block">
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!frames.length} onClick={exportCandumpLog}>
                          <FileDown className="h-4 w-4" />
                          <span className="sr-only">Export candump log</span>
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{!frames.length ? "No frames to export" : "Export raw candump log"}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-block">
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!filteredRows.length} onClick={exportVisibleCsv}>
                          <FileSpreadsheet className="h-4 w-4" />
                          <span className="sr-only">Export CSV</span>
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{!filteredRows.length ? "No filtered frames to export" : "Export current decoded table view as CSV"}</TooltipContent>
                  </Tooltip>

                  {connected ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-block">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => void disconnect()}>
                            <Unplug className="h-4 w-4" />
                            <span className="sr-only">Disconnect</span>
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Disconnect CAN bridge daemon</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-block">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openConnectionManager}>
                            <Cable className="h-4 w-4" />
                            <span className="sr-only">Connect</span>
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Connect to CAN interface / remote bridge daemon</TooltipContent>
                    </Tooltip>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-block">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-amber-600 dark:text-amber-400 disabled:opacity-40"
                          disabled={!draftSearch.trim() || alertRules.length >= 5}
                          onClick={addAlertRuleFromCurrentFilter}
                        >
                          <BellPlus className="h-4 w-4" />
                          <span className="sr-only">Add alert from filter</span>
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {!draftSearch.trim()
                        ? "Enter a display filter first to create an alert rule (Max 5 rules)"
                        : alertRules.length >= 5
                          ? "Maximum of 5 alert rules reached. Delete a rule to add another."
                          : `Create alert rule from filter: "${draftSearch.trim()}" (Max 5 rules)`}
                    </TooltipContent>
                  </Tooltip>

                  <TraceColumnMenu
                    canIdColumns={dynamicCanIdColumns}
                    payloadColumns={dynamicPayloadColumns}
                  />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-block">
                        <Button
                          variant={showDecodedPreview ? "secondary" : "ghost"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setShowDecodedPreview(!showDecodedPreview)}
                        >
                          {showDecodedPreview ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          <span className="sr-only">Decode</span>
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{showDecodedPreview ? "Hide decoded preview" : "Show decoded preview"}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-block">
                        <Button
                          variant={showTransmitComposer ? "secondary" : "ghost"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setShowTransmitComposer(!showTransmitComposer)}
                        >
                          <RadioTower className="h-4 w-4" />
                          <span className="sr-only">TX</span>
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{showTransmitComposer ? "Hide transmit composer" : "Show transmit composer"}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-block">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearFrames}>
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Clear</span>
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Clear all captured/loaded frames</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-block">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={!connected}
                          onClick={() => void (capturePaused ? resumeCapture() : pauseCapture())}
                        >
                          {capturePaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                          <span className="sr-only">{capturePaused ? "Resume capture" : "Pause capture"}</span>
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {!connected
                        ? "Connect to a CAN interface to pause/resume capture"
                        : capturePaused ? "Resume capture" : "Pause capture"}
                    </TooltipContent>
                  </Tooltip>
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
              <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2 text-xs">
                <span className="font-medium text-muted-foreground">Sort</span>
                {sortRules.length === 0 ? (
                  <span className="text-muted-foreground">Original trace order</span>
                ) : (
                  sortRules.map((rule, index) => (
                    <span key={rule.id} className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1">
                      <span className="text-[10px] text-muted-foreground">{index + 1}</span>
                      <span className="font-medium">{rule.label}</span>
                      <button type="button"
                        className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
                        title="Toggle sort direction"
                        onClick={() => flipSortRule(rule.id)}
                      >
                        {rule.direction === "asc" ? "ASC" : "DESC"}
                      </button>
                      <button type="button" className="text-muted-foreground hover:text-foreground" disabled={index === 0} title="Move earlier" onClick={() => moveSortRule(rule.id, "up")}>
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button type="button"
                        className="text-muted-foreground hover:text-foreground"
                        disabled={index === sortRules.length - 1}
                        title="Move later"
                        onClick={() => moveSortRule(rule.id, "down")}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button type="button" className="text-muted-foreground hover:text-destructive" title="Remove sort rule" onClick={() => removeSortRule(rule.id)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Select value={selectedSortPresetId || "__none"} onValueChange={(value) => value === "__none" ? setSelectedSortPresetId("") : applySortPreset(value)}>
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue placeholder="Sort presets" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sort presets</SelectItem>
                      {sortPresets.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={!sortRules.length} onClick={saveCurrentSortPreset}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={!selectedSortPresetId} onClick={deleteSelectedSortPreset}>
                    Delete
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={!sortRules.length} onClick={clearSortRules}>
                    Clear
                  </Button>
                </div>
              </div>
              {alertRules.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2 text-xs">
                  <span className="font-medium text-muted-foreground">Alerts</span>
                  {alertRules.map((rule) => (
                    <span key={rule.id} className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1">
                      <button type="button"
                        className={rule.enabled ? "font-medium text-amber-600 dark:text-amber-300 hover:underline" : "text-muted-foreground hover:underline"}
                        title={rule.expression}
                        onClick={() => toggleAlertRule(rule.id)}
                      >
                        {rule.enabled ? "🔔 On" : "🔕 Off"}: {rule.name}
                      </button>
                      <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => deleteAlertRule(rule.id)} title="Delete alert">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <CardContent className="min-h-0 min-w-0 flex-1 p-0">
                <TableVirtuoso
                  ref={tableVirtuosoRef}
                  className="h-full"
                  data={visibleRows}
                  components={virtuosoComponents}
                  computeItemKey={(_index, row) => row.key}
                  fixedHeaderContent={fixedHeaderContent}
                  itemContent={virtualRowContent}
                  defaultItemHeight={45}
                  followOutput={status === "connected" && !traceSourceName ? "smooth" : false}
                />
              </CardContent>
              {loadedTracePaginationEnabled && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-3 py-2 text-xs">
                  <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <span className="font-medium text-foreground">Loaded trace pages</span>
                    <span>
                      {filteredRows.length === 0 ? "0 frames" : `${pageStartIndex + 1}-${pageEndIndex} of ${filteredRows.length} frames`}
                    </span>
                    {frames.length !== filteredRows.length && <span>filtered from {frames.length}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">Rows</span>
                    <Select value={String(loadedPageSize)} onValueChange={(value) => setLoadedPageSize(Number(value))}>
                      <SelectTrigger className="h-8 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {loadedTracePageSizes.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={safeLoadedPageIndex === 0}
                      onClick={() => setLoadedPageIndex(0)}
                    >
                      First
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={safeLoadedPageIndex === 0}
                      onClick={() => setLoadedPageIndex(safeLoadedPageIndex - 1)}
                    >
                      Previous
                    </Button>
                    <span className="min-w-24 text-center font-mono text-[11px] text-muted-foreground">
                      Page {safeLoadedPageIndex + 1} / {loadedTracePageCount}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={safeLoadedPageIndex >= loadedTracePageCount - 1}
                      onClick={() => setLoadedPageIndex(safeLoadedPageIndex + 1)}
                    >
                      Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={safeLoadedPageIndex >= loadedTracePageCount - 1}
                      onClick={() => setLoadedPageIndex(loadedTracePageCount - 1)}
                    >
                      Last
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </section>
        </div>

        {(showDecodedPreview || showTransmitComposer) && (
        <aside className="min-w-0 flex min-h-[45vh] flex-col gap-3 overflow-visible xl:min-h-0 xl:overflow-hidden">
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
          <button type="button"
            className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => applyColumnSort(headerContextMenu.column, "asc", "replace")}
          >
            <span>Sort ascending</span>
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button"
            className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => applyColumnSort(headerContextMenu.column, "desc", "replace")}
          >
            <span>Sort descending</span>
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => applyColumnSort(headerContextMenu.column, "asc", "add")}
          >
            Add as next ascending sort
          </button>
          <button type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => applyColumnSort(headerContextMenu.column, "desc", "add")}
          >
            Add as next descending sort
          </button>
          {sortRules.length > 0 && (
            <button type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
              onClick={clearSortRules}
            >
              Clear sorting
            </button>
          )}
          <div className="my-1 border-t" />
          {(() => {
            const selectedValue = selectedValueForColumn(headerContextMenu.column);
            const canAppend = headerCanAppend();
            return (
              <>
                <button type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={selectedValue == null}
                  onClick={() => selectedValue != null && applyColumnFilter(headerContextMenu.column, "replace", selectedValue)}
                >
                  <span>Replace with selected value</span>
                  <span className="max-w-28 truncate font-mono text-xs text-muted-foreground">{selectedValue ?? "No row"}</span>
                </button>
                <button type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={selectedValue == null || !canAppend}
                  onClick={() => selectedValue != null && applyColumnFilter(headerContextMenu.column, "and", selectedValue)}
                >
                  Add AND selected value
                </button>
                <button type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={selectedValue == null || !canAppend}
                  onClick={() => selectedValue != null && applyColumnFilter(headerContextMenu.column, "or", selectedValue)}
                >
                  Add OR selected value
                </button>
                <div className="my-1 border-t" />
                <button type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => applyColumnFilter(headerContextMenu.column, "replace")}
                >
                  Start editable condition
                </button>
                <button type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canAppend}
                  onClick={() => applyColumnFilter(headerContextMenu.column, "and")}
                >
                  Add AND editable condition
                </button>
                <button type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canAppend}
                  onClick={() => applyColumnFilter(headerContextMenu.column, "or")}
                >
                  Add OR editable condition
                </button>
                {currentFilterForAppend() && (
                  <>
                    <div className="my-1 border-t" />
                    <button type="button"
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
          <button type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => copyText(contextMenu.value)}
          >
            Copy Value
          </button>
          <button type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => copyText(formatCanMessage(contextMenu.frame))}
          >
            Copy CAN Message
          </button>
          <button type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => copyText(formatCandumpLine(contextMenu.frame))}
          >
            Copy candump Line
          </button>
          <button type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => stageFrameForTransmit(contextMenu.frame)}
          >
            Use in Transmit Composer
          </button>
          <button type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => stageFrameForSimulator(contextMenu.frame)}
          >
            Copy to Simulator TX
          </button>
          <div className="my-1 border-t" />
          <button type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => defineMessageStructure(contextMenu.frame)}
          >
            Define Message Structure
          </button>
          <button type="button"
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



