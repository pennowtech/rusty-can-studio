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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConnectionStore } from "@/store/connectionStore";
import { useAppStore } from "@/store/appShellStore";
import { useUiStore } from "@/store/uiStore";
import { useTransmitDraftStore } from "@/store/transmitDraftStore";
import { loadedTracePageSizes, monitorColumnLabels, MonitorColumnId, useMonitorPreferencesStore } from "@/store/monitorPreferencesStore";
import { useFieldColumnsStore } from "@/store/fieldColumnsStore";
import { suggestedFieldColumns } from "@sbt/desktop-kit/utils/createFieldColumnsStore";
import { sortRows } from "@sbt/desktop-kit/utils/tableSort";
import { formatPayloadFieldsText, PayloadFieldsCell, type PayloadDisplayMode, type PayloadFieldValue } from "@sbt/desktop-kit/components/PayloadFieldsCell";
import { Table, type TableColumn as KitTableColumn, type TableRow as KitTableRow } from "@sbt/desktop-kit/components/table/Table";
import { FilterBar } from "@sbt/desktop-kit/components/table/FilterBar";
import { resolveProfileReferences, useProfileStore } from "@/profile-editor/store/profileStore";
import { DecodedField, DecodedFrame, decodeFrameWithProfiles } from "@/profile-editor/decodeProfile";
import { listVariants } from "@/profile-editor/messageListHelpers";
import { identifyByFromVariantKey } from "@/profile-editor/profileFieldHelpers";
import { DecodedPreviewPanel } from "@/profile-editor/DecodedPreviewPanel";
import { parseCandump } from "@/can/candump";
import { Activity, ArrowDown, ArrowUp, Cable, Columns3, Eye, EyeOff, FileDown, FileSpreadsheet, FolderOpen, Gauge, HelpCircle, Lightbulb, Pause, Play, RadioTower, Send, Trash2, Unplug } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { TableVirtuosoHandle } from "react-virtuoso";
import type { WsFrame } from "@/can-bridge/ws/types";
import type { ProfileDocument } from "@/profile-editor/model/profile";
import { toast } from "sonner";
import {
  findInvalidRegexClause,
  looksLikeExpression,
  matchesExpression,
  parseFilterExpression,
  type FieldResolver,
  type FilterNode,
} from "@sbt/desktop-kit/utils/filterExpression";
import type { DisplayFilterPreset } from "@sbt/desktop-kit/components/FilterPresetsButton";
import type { MonitorAlertRule } from "@sbt/desktop-kit/components/AlertRulesPopoverButton";

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

// The Time column's cells only show HH:MM:SS.mmm (see formatTime) — good
// for scanning a live trace, but it hides the date entirely, so there's no
// way to tell what date to pick in the time-filter picker's Date & time
// mode for a loaded file. This builds that missing context as a hover
// tooltip: the full local date+time (exactly what the picker's Date & time
// tab needs), plus the raw millisecond number (exactly what its Raw (ms)
// tab needs) — so either picker mode can be used without guessing.
function formatTimeTooltip(tsMs: number) {
  const date = new Date(tsMs);
  if (!Number.isFinite(date.getTime())) return `${tsMs} ms`;

  const yyyy = date.getFullYear();
  const mo = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mo}-${dd} ${formatTime(tsMs)} (raw: ${tsMs} ms)`;
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
  for (const field of profile.payload.common?.fields ?? []) names.add(field.name);

  return Array.from(names).map((name) => ({
    id: `payload:${name}`,
    label: name,
  }));
}

type ParsedFilter = {
  valid: boolean;
  error?: string;
  isEmpty: boolean;
  // Set when the text parses as a structured expression; null means either
  // empty input or plain free text, handled via `freeText` instead (see
  // looksLikeExpression — a bare word like "kitchen" stays a substring
  // search rather than being forced through the expression grammar).
  node: FilterNode | null;
  freeText: string;
};

// canId/id specifically — used only to rewrite an unquoted "0x..." literal
// back to hex-string form in normalizeCanIdLiterals below (JS auto-parses
// "0x18203C01" as a decimal number, which then wouldn't match the hex
// string canId actually resolves to; see that function for the full story).
const HEX_LITERAL_FIELDS = new Set(["canid", "id"]);

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Every key buildTraceRow can ever put in values/numericValues that isn't
// profile-dependent (canId/payload field names are added below, per loaded
// profile) - kept in sync with buildTraceRow's own literal keys by hand,
// since there's no runtime list to derive it from.
const STATIC_ROW_FIELD_NAMES = [
  "time", "line", "iface", "canId", "id", "dir", "len", "mode", "payload", "rawPayload", "message", "txStatus", "txError",
  "meaning", "frameName", "serviceName", "serviceIdentifier", "instanceName", "instanceIndex", "attributeName",
  "attributeAddress", "featureName", "featureIndex", "commandClass", "sourceAddress", "destinationAddress",
  "messageGood", "errorCode", "errorText", "hasError", "error",
];

// Every field name row.values could ever contain across the currently
// loaded profiles - static columns, every canId field, every payload.common
// field, and every variant's own payload fields (bare and "canId:"/
// "payload:"-prefixed, matching buildTraceRow's own key convention) -
// including variants, unlike profilePayloadColumns above, since a
// variant-specific field is exactly the case that used to be slow to
// fuzzy-resolve (see getRowField below).
function collectKnownRowFieldNames(profiles: ProfileDocument[]): Set<string> {
  const names = new Set(STATIC_ROW_FIELD_NAMES);
  for (const profile of profiles) {
    for (const field of profile.layouts.canId.fields) {
      names.add(field.name);
      names.add(`canId:${field.name}`);
    }
    for (const field of profile.payload.common?.fields ?? []) {
      names.add(field.name);
      names.add(`payload:${field.name}`);
    }
    for (const entry of Object.values(profile.payload.variants ?? {})) {
      const variants = Array.isArray(entry) ? entry : [entry];
      for (const variant of variants) {
        for (const field of variant.payload.fields) {
          names.add(field.name);
          names.add(`payload:${field.name}`);
        }
      }
    }
  }
  return names;
}

// getRowField's fuzzy fallback (case/punctuation-insensitive field-name
// matching, so a display filter tolerates "CanId" vs "canId") used to scan
// Object.keys(row.values) fresh on every call that missed the exact-match
// fast path - fine for the handful of ad-hoc lookups in
// selectedValueForColumn, but the filter engine calls getRowField once per
// row per field reference in the expression, and a field that's genuinely
// absent from most rows (any variant-specific field - present only in the
// rows whose message actually matched that variant) hit the expensive scan
// for nearly every row, every time traceRows changed - i.e. every ~100ms
// during live capture. Resolving instead against the fixed, profile-derived
// universe below means a given typed field name only ever needs resolving
// once (memoized in fieldNameResolutionCache), not once per row - a row
// missing the resolved key is then just a cheap property check.
let knownRowFieldNames: Set<string> = new Set(STATIC_ROW_FIELD_NAMES);
const fieldNameResolutionCache = new Map<string, string | null>();

function setKnownRowFieldNames(profiles: ProfileDocument[]) {
  knownRowFieldNames = collectKnownRowFieldNames(profiles);
  fieldNameResolutionCache.clear();
}

function resolveFuzzyFieldName(fieldName: string): string | null {
  const cached = fieldNameResolutionCache.get(fieldName);
  if (cached !== undefined) return cached;

  const lower = fieldName.toLowerCase();
  let resolved: string | null = null;
  for (const candidate of knownRowFieldNames) {
    if (candidate.toLowerCase() === lower) {
      resolved = candidate;
      break;
    }
  }
  if (!resolved) {
    const wanted = normalizeKey(fieldName);
    for (const candidate of knownRowFieldNames) {
      if (normalizeKey(candidate) === wanted) {
        resolved = candidate;
        break;
      }
    }
  }
  fieldNameResolutionCache.set(fieldName, resolved);
  return resolved;
}

function getRowField(row: TraceRow, fieldName: string): { value: string; numeric: number | undefined } | undefined {
  if (row.values[fieldName] !== undefined) {
    return { value: row.values[fieldName], numeric: row.numericValues[fieldName] };
  }

  const resolvedKey = resolveFuzzyFieldName(fieldName);
  if (!resolvedKey || row.values[resolvedKey] === undefined) return undefined;
  return { value: row.values[resolvedKey], numeric: row.numericValues[resolvedKey] };
}

const canFilterResolver: FieldResolver<TraceRow> = {
  resolveKnownField(row, field) {
    const found = getRowField(row, field);
    if (!found) return undefined;
    // "time" is deliberately numeric-only: values.time is a "HH:MM:SS.mmm"
    // display string (formatTime) that can never round-trip back to the
    // ms number below, so the general round-trip check (next) always
    // rejected it — meaning ordering comparisons (time > ..., time >= ...)
    // silently matched nothing. Always resolving the raw ms here is what
    // makes TimeFilterPopover's generated `time >= <ms>` clauses work.
    if (field === "time") return found.numeric;
    // Prefer the numeric form only when it round-trips exactly back to the
    // display text — true for plain-numeric fields (len, line), but NOT
    // for a decoded enum (displayValue "k2_focus_control", numeric the raw
    // code) or a unit-suffixed measurement ("50 km/h"). Those fall through
    // to the string, which is what `==`/`~`/`~=` need to work against the
    // label the user actually sees and types.
    if (found.numeric !== undefined) {
      const parsedFromText = Number(found.value);
      if (Number.isFinite(parsedFromText) && parsedFromText === found.numeric) return found.numeric;
    }
    return found.value;
  },
  // CAN rows have no JSON payload concept — every field (including decoded
  // signals) is already flattened into row.values/numericValues above.
  getJsonPayload() {
    return undefined;
  },
};

// "0x18203C01" is unquoted, so the tokenizer treats it as one token and
// parseLiteral hands it to JS's Number(), which happily hex-parses a "0x"
// prefix into a decimal number (4-digit "0x1000" -> 4096) — but canId's
// resolved value is the hex *string* form ("18203C01", no prefix), so an
// unconverted numeric literal would never match. Rewriting == / != clauses
// back to that hex-string form (only where a numeric literal came from a
// string-canonical field) keeps `canId == 0x18203C01` working as documented
// in the filter help. Ordering (>, <, ...) isn't rewritten — a hex canId
// has no meaningful numeric-vs-string ordering story, and always didn't
// before this migration either.
function normalizeCanIdLiterals(node: FilterNode): FilterNode {
  switch (node.type) {
    case "and":
      return { type: "and", left: normalizeCanIdLiterals(node.left), right: normalizeCanIdLiterals(node.right) };
    case "or":
      return { type: "or", left: normalizeCanIdLiterals(node.left), right: normalizeCanIdLiterals(node.right) };
    case "not":
      return { type: "not", expr: normalizeCanIdLiterals(node.expr) };
    case "compare":
      if ((node.op === "==" || node.op === "!=") && HEX_LITERAL_FIELDS.has(node.field.toLowerCase()) && typeof node.value === "number") {
        return { ...node, value: formatCanId(node.value) };
      }
      return node;
    case "truthy":
      return node;
  }
}

function parseDisplayFilter(text: string): ParsedFilter {
  const trimmed = text.trim();
  const freeText = trimmed.toLowerCase();
  if (!trimmed) return { valid: true, isEmpty: true, node: null, freeText };
  if (!looksLikeExpression(trimmed)) return { valid: true, isEmpty: false, node: null, freeText };
  try {
    const node = normalizeCanIdLiterals(parseFilterExpression(trimmed));
    const regexError = findInvalidRegexClause(node);
    if (regexError) return { valid: false, error: regexError, isEmpty: false, node: null, freeText };
    return { valid: true, isEmpty: false, node, freeText };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err), isEmpty: false, node: null, freeText };
  }
}

function rowMatchesFilter(row: TraceRow, parsed: ParsedFilter) {
  if (!parsed.valid || parsed.isEmpty) return true;
  if (parsed.node) return matchesExpression(parsed.node, row, canFilterResolver);
  if (parsed.freeText === "error") return row.hasError;
  return row.haystack.includes(parsed.freeText);
}

function rowKeyFor(frame: WsFrame, index: number) {
  if (frame.line_no != null) {
    // Qualified by iface, not just line_no alone: assignLineNumbers keeps
    // whatever line_no a frame already arrives with (rather than always
    // reassigning), so if any frame source ever numbers per-interface
    // instead of globally, two different frames on different interfaces
    // could otherwise collide on the same react-virtuoso item key - which
    // reads as rows visually swapping/scrambling, not as an actual data
    // reorder (the underlying array order is unaffected either way).
    return `line-${frame.iface}-${frame.line_no}`;
  }
  return `frame-${frame.ts_ms}-${frame.iface}-${frame.id}-${index}`;
}

function formatDecodedValue(field: DecodedField) {
  return field.displayValue;
}

function toPayloadFieldValues(fields: DecodedField[]): PayloadFieldValue[] {
  return fields.map((field) => ({ name: field.name, value: formatDecodedValue(field) }));
}

// Shared shape for the trace table's Payload column - the same data feeds
// the plain-text form (search/CSV, via formatPayloadFieldsText) and the
// rich inline JSX form (PayloadFieldsCell) so the two never drift. `matched`
// means "anything at all decoded" (common fields, variant fields, or both)
// - NOT "a variant matched" (decoded.requiresSchema alone would conflate
// "CAN ID unknown, nothing decoded" with "message type known, common
// fields decoded fine, just no defined variant for these values", and
// those two states deserve different fallbacks: raw hex only for the
// former, since the latter already has real decoded content to point to.
function payloadCellData(frame: WsFrame, decoded: DecodedFrame | null | undefined, mode: PayloadDisplayMode) {
  return {
    mode,
    commonFields: toPayloadFieldValues(decoded?.payloadCommonFields ?? []),
    variantFields: toPayloadFieldValues(decoded?.payloadVariantFields ?? []),
    matched: Boolean(decoded && (decoded.payloadCommonFields.length > 0 || decoded.payloadVariantFields.length > 0)),
    // "0x" + space-separated bytes - display-only, so this reads
    // unambiguously as hex rather than looking like binary digits. Kept
    // separate from formatPayloadBytes(), which stays space-separated and
    // unprefixed for the contexts that need plain hex (candump export
    // lines, the transmit composer's editable payload field).
    rawHex: `0x${frame.data_hex.replace(/[^0-9a-fA-F]/g, "").toUpperCase()}`,
    errorCode: decoded?.errorCode,
    errorText: decoded?.errorText,
  };
}

function buildTraceRow(frame: WsFrame, index: number, decoded: DecodedFrame | null, payloadDisplayMode: PayloadDisplayMode): TraceRow {
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
    values.payload = formatPayloadFieldsText(payloadCellData(frame, decoded, payloadDisplayMode));
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

// Gives a prop a stable identity across renders while always calling
// whatever the latest render's logic actually is - no stale-closure risk,
// unlike useCallback with a hand-picked dependency array. Needed for the
// callbacks handed to the shared Table component: Table.tsx's own
// virtuosoComponents memo (and, more importantly, react-virtuoso's
// followOutput tracking) treats a changed callback identity as "something
// meaningful changed" - passing a fresh inline arrow function on every
// render here defeated that memoization and was the likely cause of
// follow-to-bottom scrolling not working reliably during live capture.
function useStableCallback<TArgs extends unknown[], TReturn>(callback: (...args: TArgs) => TReturn): (...args: TArgs) => TReturn {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useRef((...args: TArgs) => callbackRef.current(...args)).current;
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
  column: DynamicMonitorColumn;
};

type SortDirection = "asc" | "desc";

export type MonitorSortRule = {
  id: string;
  columnId: string;
  label: string;
  direction: SortDirection;
};

const DISPLAY_FILTER_PRESETS_KEY = "cansim.monitor.filterPresets.v1";
const MONITOR_SORT_RULES_KEY = "cansim.monitor.sortRules.v1";
const MONITOR_ALERT_RULES_KEY = "cansim.monitor.alertRules.v1";
const TRACE_COLUMN_WIDTHS_KEY = "cansim.monitor.columnWidths.v1";

function loadTraceColumnWidths(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRACE_COLUMN_WIDTHS_KEY) ?? "{}") as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveTraceColumnWidths(widths: Record<string, number>) {
  localStorage.setItem(TRACE_COLUMN_WIDTHS_KEY, JSON.stringify(widths));
}

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

function filterFieldForColumn(column: DynamicMonitorColumn) {
  return column.id;
}

function quoteFilterValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "\"\"";
  if (/^[A-Za-z0-9_.:-]+$/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function defaultOperatorForColumn(column: DynamicMonitorColumn, value?: string) {
  if (column.id === "payload" || value?.includes(", ")) return "~";
  return "==";
}

function buildColumnFilterExpression(column: DynamicMonitorColumn, value?: string) {
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
  pinnedCanIdColumns,
  pinnedPayloadColumns,
  onUnpin,
  payloadDisplayMode,
  onPayloadDisplayModeChange,
}: {
  pinnedCanIdColumns: DynamicMonitorColumn[];
  pinnedPayloadColumns: DynamicMonitorColumn[];
  onUnpin: (id: string) => void;
  payloadDisplayMode: PayloadDisplayMode;
  onPayloadDisplayModeChange: (mode: PayloadDisplayMode) => void;
}) {
  const columns = useMonitorPreferencesStore((s) => s.monitorColumns);
  const toggleColumn = useMonitorPreferencesStore((s) => s.toggleMonitorColumn);
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Payload display</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={payloadDisplayMode} onValueChange={(value) => onPayloadDisplayModeChange(value as PayloadDisplayMode)}>
          <DropdownMenuRadioItem value="full" onSelect={(event) => event.preventDefault()}>
            <div>
              <div className={payloadDisplayMode === "full" ? "font-semibold" : undefined}>Full payload</div>
              <div className="text-[11px] text-muted-foreground">Common + variant fields together</div>
            </div>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="variantOnly" onSelect={(event) => event.preventDefault()}>
            <div>
              <div className={payloadDisplayMode === "variantOnly" ? "font-semibold" : undefined}>Variant fields only</div>
              <div className="text-[11px] text-muted-foreground">Pin common fields as columns instead</div>
            </div>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
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
        {pinnedCanIdColumns.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Pinned CAN ID fields</DropdownMenuLabel>
            {pinnedCanIdColumns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => onUnpin(column.id)}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
        {pinnedPayloadColumns.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Pinned payload fields</DropdownMenuLabel>
            {pinnedPayloadColumns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => onUnpin(column.id)}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
        {pinnedCanIdColumns.length === 0 && pinnedPayloadColumns.length === 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No decoded fields pinned yet. Pin one from the Decoded Preview panel.
            </div>
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
  // Keeps getRowField's fuzzy-match universe (module-level, so the filter
  // engine's plain functions can see it) in sync with the loaded profiles.
  // Updated during render rather than in an effect so it's already correct
  // by the time matchedRowKeys/filteredRows below evaluate in this same
  // pass - matches the same during-render-cache-update pattern traceRows
  // already uses for decodedFrameCacheRef further down.
  const knownRowFieldNamesProfilesRef = useRef<typeof profilesForDecode>(undefined);
  if (knownRowFieldNamesProfilesRef.current !== profilesForDecode) {
    knownRowFieldNamesProfilesRef.current = profilesForDecode;
    setKnownRowFieldNames(profilesForDecode);
  }
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
  const traceFrameLimit = useConnectionStore((s) => s.traceFrameLimit);

  const activeProfile = profiles.find((profile) => profile.id === activeId);
  const search = useMonitorPreferencesStore((s) => s.search);
  const setSearch = useMonitorPreferencesStore((s) => s.setSearch);
  const filterDisplayMode = useMonitorPreferencesStore((s) => s.filterDisplayMode);
  const setFilterDisplayMode = useMonitorPreferencesStore((s) => s.setFilterDisplayMode);
  const monitorColumns = useMonitorPreferencesStore((s) => s.monitorColumns);
  const payloadDisplayMode = useMonitorPreferencesStore((s) => s.payloadDisplayMode);
  const setPayloadDisplayMode = useMonitorPreferencesStore((s) => s.setPayloadDisplayMode);
  const pinnedFieldIds = useFieldColumnsStore((s) => s.fields);
  const pinnedFieldSet = useMemo(() => new Set(pinnedFieldIds), [pinnedFieldIds]);
  const togglePinnedField = useFieldColumnsStore((s) => s.togglePin);
  const addPinnedFields = useFieldColumnsStore((s) => s.addFields);
  const pruneToKnownFields = useFieldColumnsStore((s) => s.pruneToKnownFields);
  const suggestionsVisible = useFieldColumnsStore((s) => s.suggestionsVisible);
  const toggleSuggestionsVisible = useFieldColumnsStore((s) => s.toggleSuggestionsVisible);
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
  const [alertRules, setAlertRules] = useState<MonitorAlertRule[]>(loadMonitorAlertRules);
  const lastTraceSourceNameRef = useRef<string | undefined>(traceSourceName);
  // Explicit widths from dragging a column's resize handle - the only
  // source of a non-default column width now (see the removed
  // auto-measure effect's comment further down). Persisted across
  // restarts.
  const [columnUserWidths, setColumnUserWidths] = useState<Record<string, number>>(loadTraceColumnWidths);

  useEffect(() => {
    setDraftSearch(search);
  }, [search]);

  // Draft->committed debounce now lives inside the shared FilterBar
  // component itself (onCommittedChange={setSearch}) - see
  // @sbt/desktop-kit/components/table/FilterBar.

  const appliedSearch = useDeferredValue(search);
  const parsedFilter = useMemo(() => parseDisplayFilter(appliedSearch), [appliedSearch]);
  const draftParsedFilter = useMemo(() => parseDisplayFilter(draftSearch), [draftSearch]);
  const filterPending = draftSearch !== appliedSearch;

  // Decode is cached per frame *object* (not per index/array) - decoding
  // is real work (bit extraction, dictionary lookups, error-rule
  // evaluation), and re-running it for every historical frame on every
  // single new live-capture frame is O(totalFrames) work per frame
  // arrival, which is what made the trace table grind to a halt (and
  // visibly lag behind real arrival time) past a few thousand rows. The
  // connection store only ever creates a *new* frame object for a frame
  // that's actually new or whose metadata (tx_status, etc.) just changed —
  // every other frame keeps its exact prior reference — so a WeakMap-style
  // per-object cache (rebuilt each pass, so trimmed-off frames fall out of
  // it naturally) turns this into O(new/changed frames only).
  const decodedFrameCacheRef = useRef(new Map<WsFrame, TraceRow>());
  const decodedCacheProfilesRef = useRef<typeof profilesForDecode>(undefined);
  const decodedCacheModeRef = useRef<PayloadDisplayMode>(undefined);

  const traceRows = useMemo(() => {
    if (decodedCacheProfilesRef.current !== profilesForDecode || decodedCacheModeRef.current !== payloadDisplayMode) {
      decodedFrameCacheRef.current = new Map();
      decodedCacheProfilesRef.current = profilesForDecode;
      decodedCacheModeRef.current = payloadDisplayMode;
    }
    const cache = decodedFrameCacheRef.current;
    const nextCache = new Map<WsFrame, TraceRow>();
    const rows = frames.map((frame, index) => {
      const cached = cache.get(frame);
      if (cached) {
        nextCache.set(frame, cached);
        return cached;
      }
      const decoded = decodeFrameWithProfiles(profilesForDecode, frame);
      const row = buildTraceRow(frame, index, decoded, payloadDisplayMode);
      nextCache.set(frame, row);
      return row;
    });
    decodedFrameCacheRef.current = nextCache;
    return rows;
  }, [frames, profilesForDecode, payloadDisplayMode]);


  const isLiveStreaming = status === "connected" && !capturePaused && !traceSourceName;
  const isFilterActive = parsedFilter.valid && !parsedFilter.isEmpty;
  const isHighlightMode = filterDisplayMode === "highlight";
  const [accumulatedFilteredRows, setAccumulatedFilteredRows] = useState<TraceRow[]>([]);
  const lastProcessedLineRef = useRef<number>(0);
  const lastFilterKeyRef = useRef<string>("");

  const currentFilterKey = `${appliedSearch}-${profilesForDecode.map((p) => p.meta.name).join(",")}`;

  useEffect(() => {
    // traceRows.length === 0 catches "Clear" while a filter is active and
    // live-streaming continues (frames.length back to 0, but isFilterActive/
    // isLiveStreaming/isHighlightMode are all unchanged - none of those
    // alone signal a clear happened). Without this, accumulatedFilteredRows
    // keeps its pre-clear contents forever: currentFilterKey doesn't change
    // (it's search text + profile names, not row data), so the branch below
    // treats it as "same filter, just no new matching rows yet" and never
    // rebuilds from the now-empty traceRows.
    if (!isFilterActive || !isLiveStreaming || isHighlightMode || traceRows.length === 0) {
      setAccumulatedFilteredRows([]);
      lastProcessedLineRef.current = 0;
      lastFilterKeyRef.current = "";
      return;
    }

    if (lastFilterKeyRef.current !== currentFilterKey) {
      lastFilterKeyRef.current = currentFilterKey;
      const initialMatches = traceRows.filter((row) => rowMatchesFilter(row, parsedFilter));
      setAccumulatedFilteredRows(initialMatches.slice(Math.max(0, initialMatches.length - traceFrameLimit)));
      lastProcessedLineRef.current = traceRows.length > 0 ? (traceRows[traceRows.length - 1].frame.line_no ?? 0) : 0;
      return;
    }

    const newRows = traceRows.filter((row) => (row.frame.line_no ?? 0) > lastProcessedLineRef.current);
    if (newRows.length > 0) {
      lastProcessedLineRef.current = Math.max(lastProcessedLineRef.current, newRows[newRows.length - 1].frame.line_no ?? 0);
      const matchingNew = newRows.filter((row) => rowMatchesFilter(row, parsedFilter));
      if (matchingNew.length > 0) {
        setAccumulatedFilteredRows((prev) => {
          const combined = [...prev, ...matchingNew];
          return combined.slice(Math.max(0, combined.length - traceFrameLimit));
        });
      }
    }
  }, [currentFilterKey, isFilterActive, isHighlightMode, isLiveStreaming, parsedFilter, traceRows, traceFrameLimit]);

  // Same object-identity caching pattern as traceRows/kitRows above -
  // without it, Highlight mode re-ran rowMatchesFilter for every single row
  // on every ~100ms live-capture batch (traceRows gets a new array
  // reference every batch even though almost none of its rows actually
  // changed), which is what kept Highlight mode unresponsive even after
  // getRowField's fuzzy-lookup fix: that fix made each row's match check
  // cheap, but every row was still being re-checked every batch regardless.
  // Cache is keyed by TraceRow object identity (stable for unchanged
  // frames, same guarantee traceRows itself relies on) and reset whenever
  // the filter text or loaded profiles actually change.
  const matchCacheRef = useRef(new Map<TraceRow, boolean>());
  const matchCacheFilterKeyRef = useRef<string>("");

  const matchedRowKeys = useMemo(() => {
    if (!isFilterActive || !isHighlightMode) return null;
    if (matchCacheFilterKeyRef.current !== currentFilterKey) {
      matchCacheRef.current = new Map();
      matchCacheFilterKeyRef.current = currentFilterKey;
    }
    const cache = matchCacheRef.current;
    const nextCache = new Map<TraceRow, boolean>();
    const keys = new Set<string>();
    for (const row of traceRows) {
      let isMatch = cache.get(row);
      if (isMatch === undefined) {
        isMatch = rowMatchesFilter(row, parsedFilter);
      }
      nextCache.set(row, isMatch);
      if (isMatch) keys.add(row.key);
    }
    matchCacheRef.current = nextCache;
    return keys;
  }, [currentFilterKey, isFilterActive, isHighlightMode, parsedFilter, traceRows]);

  const filteredRows = useMemo(() => {
    if (!isFilterActive || isHighlightMode) {
      return traceRows;
    }
    if (isLiveStreaming) {
      return accumulatedFilteredRows;
    }
    return traceRows.filter((row) => rowMatchesFilter(row, parsedFilter));
  }, [accumulatedFilteredRows, isFilterActive, isHighlightMode, isLiveStreaming, parsedFilter, traceRows]);
  // Uses the shared kit's sortRows, not a local reimplementation - it does
  // a direct values[columnId]/numericValues[columnId] lookup with no
  // fallback, unlike getRowField's fuzzy/case-insensitive matching (that
  // exists for human-typed display-filter text, never appropriate for a
  // sort rule's machine-generated columnId). Reusing getRowField here used
  // to make every row missing the sorted field's value fall through to an
  // Object.keys() + double toLowerCase() scan on every single comparator
  // call - at 100k rows sorted by a pinned field only some messages
  // produce, that's what made clicking a header freeze the whole app.
  const sortedRows = useMemo(() => sortRows(filteredRows, sortRules), [filteredRows, sortRules]);
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
  }, [loadedPageSize, loadedTracePaginationEnabled, safeLoadedPageIndex]);

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

  const expectedResponseOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const profile of profilesForDecode) {
      for (const { key, variant } of listVariants(profile)) {
        const identifyBy = identifyByFromVariantKey(profile.payload.discriminator, key);
        const commandClass = identifyBy.command_class;
        const messageText = `${variant.id} ${variant.label}`.toLowerCase();
        if (commandClass != null && !["3", "5", "response", "event", "event/notification"].includes(String(commandClass)) && !messageText.includes("response") && !messageText.includes("event")) {
          continue;
        }
        byId.set(variant.id, variant.label ?? variant.id);
      }
    }
    return Array.from(byId.entries()).map(([id, label]) => ({ id, label }));
  }, [profilesForDecode]);
  // Every canId:*/payload:* field currently decodable across the loaded
  // profiles - the universe pinning can choose from, and (via
  // pruneToKnownFields below) what keeps a pinned column from outliving the
  // profile that produced it. Not itself shown as columns - see
  // pinnedDynamicColumns for that.
  const availableDynamicColumns = useMemo(() => {
    const byId = new Map<string, TraceColumn>();
    for (const column of dynamicCanIdColumns) byId.set(column.id, { ...column, kind: "canId" as const });
    for (const column of dynamicPayloadColumns) byId.set(column.id, { ...column, kind: "payloadHeader" as const });
    return byId;
  }, [dynamicCanIdColumns, dynamicPayloadColumns]);
  const pinnedDynamicColumns = useMemo(
    () => pinnedFieldIds.map((id) => availableDynamicColumns.get(id)).filter((column): column is TraceColumn => Boolean(column)),
    [availableDynamicColumns, pinnedFieldIds],
  );
  const allTraceColumns = useMemo<TraceColumn[]>(() => {
    const staticColumns: TraceColumn[] = monitorColumnOrder.map((id) => ({
      id,
      label: monitorColumnLabels[id],
      kind: "static" as const,
    }));
    const byId = new Map([...staticColumns, ...pinnedDynamicColumns].map((column) => [column.id, column]));
    return [
      ...columnOrder.map((id) => byId.get(id)).filter((column): column is TraceColumn => Boolean(column)),
      ...Array.from(byId.values()).filter((column) => !columnOrder.includes(column.id)),
    ];
  }, [columnOrder, pinnedDynamicColumns]);
  // Static columns keep their own show/hide toggle (monitorColumns); a
  // dynamic (canId/payload field) column's presence in pinnedDynamicColumns
  // already means "pinned", so it's always visible once it's a column at
  // all - no separate visibility flag to check.
  const visibleTraceColumns = useMemo(
    () => allTraceColumns.filter((column) => (column.kind === "static" ? monitorColumns[column.id as MonitorColumnId] : true)),
    [allTraceColumns, monitorColumns],
  );
  const suggestedPayloadColumns = useMemo(() => {
    const suggestedIds = suggestedFieldColumns([dynamicPayloadColumns.map((column) => column.id)], pinnedFieldIds);
    return suggestedIds.map((id) => availableDynamicColumns.get(id)).filter((column): column is TraceColumn => Boolean(column));
  }, [availableDynamicColumns, dynamicPayloadColumns, pinnedFieldIds]);

  // Column widths are explicit-resize-only now (columnUserWidths) - no
  // longer auto-measured from row content. The auto-measure effect that
  // used to live here (even in its incremental, debounced final form) was
  // still O(new rows) work + a periodic full-table reflow on every live
  // capture session; removing it entirely was the actual fix once
  // rusty-can-studio's real trace volumes turned out to run into the tens
  // of thousands of rows, not just the low thousands. Columns now use
  // getColumnBaseWidth's static default until a user drags them wider.

  useEffect(() => {
    pruneToKnownFields(new Set([...dynamicCanIdColumns, ...dynamicPayloadColumns].map((column) => column.id)));
  }, [dynamicCanIdColumns, dynamicPayloadColumns, pruneToKnownFields]);

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
        const parsed = parseDisplayFilter(rule.expression);
        if (!parsed.valid || !rowMatchesFilter(row, parsed)) continue;
        toast.warning(rule.name, {
          description: `${formatCanId(row.frame.id)} ${formatPayloadBytes(row.frame.data_hex)}`.trim(),
          position: "top-center",
          closeButton: true,
        });
      }
    }
    lastAlertedLineRef.current = Math.max(lastAlertedLineRef.current, newRows[newRows.length - 1]?.frame.line_no ?? lastAlertedLineRef.current);
  }, [alertRules, traceRows]);

  const selectedFrame = useMemo(() => {
    if (selectedFrameKey) {
      return traceRows.find((row) => row.key === selectedFrameKey)?.frame;
    }
    return sortedRows[sortedRows.length - 1]?.frame ?? frames[frames.length - 1];
  }, [frames, selectedFrameKey, sortedRows, traceRows]);

  const selectedTraceRow = useMemo(() => {
    if (!selectedFrameKey) return null;
    return traceRows.find((row) => row.key === selectedFrameKey) ?? null;
  }, [selectedFrameKey, traceRows]);

  useEffect(() => {
    const frame = selectedFrame;
    if (frame) {
      setTxId(formatCanId(frame.id));
      setTxPayload(formatPayloadBytes(frame.data_hex));
      setTxDlc(String(byteLength(frame.data_hex)));
      stageSharedTransmitDraft(frame);
    }
  }, [selectedFrame, stageSharedTransmitDraft]);

  const selectedDecodedFrame = useMemo(() => {
    const frame = selectedFrame;
    return frame ? decodeFrameWithProfiles(profilesForDecode, frame) : null;
  }, [profilesForDecode, selectedFrame]);

  const connected = status === "connected";
  const activeIface = subscribedIfaces[0] ?? activeProfile?.iface ?? "vcan0";
  const txDisabledReason = connected ? undefined : "Connect to a CAN interface or remote bridge before sending frames.";
  const cyclicDisabledReason = cyclicActive ? undefined : txDisabledReason;
  const keyboardRows = loadedTracePaginationEnabled ? visibleRows : sortedRows;

  // Follow-to-bottom during live capture is handled entirely by the
  // shared Table's `followOutput="auto"` prop below now - it already
  // implements exactly the right rule (keep following only while the
  // viewport is already at the bottom; stop the instant the user scrolls
  // away). An explicit scrollToIndex-on-every-new-frame effect used to
  // live here too, unconditionally forcing the scroll position on every
  // batch - harmless while the ref-forwarding bug meant it silently did
  // nothing, but once that was fixed it started fighting followOutput's
  // own tracking: forcing bottom on every frame made manual scrolling
  // impossible, and toggling away from it (e.g. on row selection) could
  // leave virtuoso's internal state in whatever position that last forced
  // jump left it. Removed rather than made smarter, since followOutput
  // already *is* the smarter version of the same behavior.

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
    window.location.hash = "reference-filter-examples";
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
      const ownerIndex = loadedProfileLibrary.findIndex((profile) => listVariants(profile).some(({ variant }) => variant.id === decoded.frameName));
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

  function openHeaderContextMenu(event: MouseEvent, column: DynamicMonitorColumn) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setHeaderContextMenu({ x: event.clientX, y: event.clientY, column });
  }

  function selectedValueForColumn(column: DynamicMonitorColumn) {
    const field = filterFieldForColumn(column);
    return selectedTraceRow ? getRowField(selectedTraceRow, field)?.value : undefined;
  }

  function applyColumnFilter(column: DynamicMonitorColumn, mode: "replace" | "and" | "or", value?: string) {
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

  function deleteFilterPreset(id: string) {
    const preset = filterPresets.find((item) => item.id === id);
    if (!preset) return;
    if (!window.confirm(`Delete filter preset "${preset.name}"?`)) return;
    updateFilterPresets(filterPresets.filter((item) => item.id !== id));
    if (selectedFilterPresetId === id) setSelectedFilterPresetId("");
  }

  function updateSortRules(next: MonitorSortRule[]) {
    setSortRules(next);
    saveMonitorSortRules(next);
  }

  function makeSortRule(column: DynamicMonitorColumn, direction: SortDirection): MonitorSortRule {
    return {
      id: `${column.id}_${Date.now()}`,
      columnId: column.id,
      label: column.label,
      direction,
    };
  }

  // The plain-click / shift-click header interaction (replace vs. add to
  // multi-sort) now lives inside the shared Table component itself
  // (nextSortRulesOnHeaderClick in @sbt/desktop-kit/utils/tableSort) - this
  // stays only for the header context menu's explicit "Sort ascending" /
  // "Sort descending" / "Add as next ascending/descending sort" actions,
  // which need a caller-chosen direction the click interaction doesn't.
  function applyColumnSort(column: DynamicMonitorColumn, direction: SortDirection, mode: "replace" | "add") {
    const rule = makeSortRule(column, direction);
    const next = mode === "replace" ? [rule] : [...sortRules.filter((item) => item.columnId !== column.id), rule];
    updateSortRules(next);
    setHeaderContextMenu(null);
  }

  function clearSortRules() {
    updateSortRules([]);
    setHeaderContextMenu(null);
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
    const parsed = parseDisplayFilter(expression);
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
    // A `time` clause picked without checking the actual date first is a
    // common way to end up with an honest but confusing zero matches on a
    // loaded file — candump timestamps aren't necessarily "today". Point at
    // the Time column's hover tooltip (shows the exact date + raw ms for
    // any row) rather than asserting what the values mean, since that
    // depends on how the file was captured (relative vs. absolute timestamps).
    if (filteredRows.length === 0 && frames.length > 0 && traceSourceName && /\btime\b/.test(draftSearch)) {
      return "No matches — hover a row's Time cell to see its exact date and raw value";
    }
    return "";
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

  function rowContextMenu(event: MouseEvent, row: TraceRow) {
    openCellContextMenu(event, row.frame, row.key, "message", formatCanMessage(row.frame));
  }

  // Row coloring (tx status, error, search-highlight) - fed into the shared
  // Table's rowClassName prop, since the table itself has no opinion on
  // when a row should look different (see sbt-desktop-kit's Table.tsx).
  // Selection highlighting stays the Table's own concern (selectedRowKey).
  function traceRowClassName(row: TraceRow) {
    const txStateClass =
      row.frame.tx_status === "failed"
        ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
        : row.frame.tx_status === "pending"
          ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
          : row.frame.tx_status === "sent"
            ? "bg-sky-500/10 hover:bg-sky-500/15"
            : row.frame.scenario_status
              ? "bg-primary/10 hover:bg-primary/15"
              : "";
    const isHighlighted = isHighlightMode && (matchedRowKeys?.has(row.key) ?? false);
    return [
      row.hasError ? "bg-destructive/10 text-destructive hover:bg-destructive/15" : "",
      txStateClass,
      isHighlighted ? "bg-yellow-300/20 hover:bg-yellow-300/30 dark:bg-yellow-400/15 dark:hover:bg-yellow-400/25" : "",
    ]
      .filter(Boolean)
      .join(" ");
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

  // --- Adapter: Rusty's own TraceColumn/TraceRow -> the shared Table's
  // generic KitTableColumn/KitTableRow shape. Kept as a thin translation
  // layer right at the render boundary so everything else (column
  // derivation, context menus, CSV export, filter/sort state) stays
  // untouched and still works in terms of TraceColumn/TraceRow - only
  // rendering/virtualization/resize/reorder/sort-click move into the
  // shared Table (see sbt-desktop-kit's Table.tsx).
  function traceRowOf(row: KitTableRow): TraceRow {
    return row.detail!.data as TraceRow;
  }

  function toKitColumn(column: TraceColumn): KitTableColumn {
    const baseWidth = getColumnBaseWidth(column);

    if (column.kind === "canId" || column.kind === "payloadHeader") {
      const prefix = column.kind === "canId" ? "canId:" : "payload:";
      const fieldName = column.id.slice(prefix.length);
      return {
        id: column.id,
        label: column.label,
        kind: "field",
        groupLabel: column.kind === "canId" ? "CAN ID fields" : "Payload fields",
        baseWidth,
        renderCell: (row) => {
          const trace = traceRowOf(row);
          const fields = column.kind === "canId" ? trace.decoded?.canIdFields : trace.decoded?.payloadDecodedFields;
          const field = fields?.find((item) => item.name === fieldName);
          return <span className="font-mono text-xs">{field ? formatDecodedValue(field) : "-"}</span>;
        },
      };
    }

    switch (column.id as MonitorColumnId) {
      case "line":
        return {
          id: column.id,
          label: column.label,
          kind: "static",
          baseWidth,
          align: "right",
          renderCell: (row) => {
            const trace = traceRowOf(row);
            return <span className="font-mono text-xs text-muted-foreground">{trace.frame.line_no ?? trace.numericValues.line}</span>;
          },
        };
      case "time":
        return {
          id: column.id,
          label: column.label,
          kind: "static",
          baseWidth,
          renderCell: (row) => {
            const { frame } = traceRowOf(row);
            return (
              <span className="font-mono text-xs" title={formatTimeTooltip(frame.ts_ms)}>
                {formatTime(frame.ts_ms)}
              </span>
            );
          },
        };
      case "iface":
        return { id: column.id, label: column.label, kind: "static", baseWidth, renderCell: (row) => traceRowOf(row).frame.iface };
      case "canId":
        return {
          id: column.id,
          label: column.label,
          kind: "static",
          baseWidth,
          renderCell: (row) => <span className="font-mono">{formatCanId(traceRowOf(row).frame.id)}</span>,
        };
      case "dir":
        return {
          id: column.id,
          label: column.label,
          kind: "static",
          baseWidth,
          renderCell: (row) => {
            const { frame } = traceRowOf(row);
            return (
              <Badge
                variant={frame.dir === "tx" ? "default" : "secondary"}
                title={frame.tx_status ? `TX ${frame.tx_status}${frame.tx_error ? `: ${frame.tx_error}` : ""}` : undefined}
              >
                {frame.dir.toUpperCase()}
                {frame.tx_status ? `:${frame.tx_status}` : ""}
                {frame.scenario_status ? ` SEQ:${frame.scenario_status}` : ""}
              </Badge>
            );
          },
        };
      case "len":
        return { id: column.id, label: column.label, kind: "static", baseWidth, renderCell: (row) => byteLength(traceRowOf(row).frame.data_hex) };
      case "mode":
        return {
          id: column.id,
          label: column.label,
          kind: "static",
          baseWidth,
          renderCell: (row) => <span className="text-muted-foreground">{traceRowOf(row).frame.is_fd ? "CAN-FD" : "Classic"}</span>,
        };
      case "payload":
        return {
          id: column.id,
          label: column.label,
          kind: "static",
          baseWidth,
          renderCell: (row) => {
            const trace = traceRowOf(row);
            return <PayloadFieldsCell {...payloadCellData(trace.frame, trace.decoded, payloadDisplayMode)} />;
          },
        };
      default:
        return { id: column.id, label: column.label, kind: "static", baseWidth };
    }
  }

  const kitColumns = useMemo(() => visibleTraceColumns.map(toKitColumn), [visibleTraceColumns, payloadDisplayMode]);

  // Same object-identity cache pattern as traceRows above - wrapping every
  // TraceRow into a KitTableRow is cheap per row, but re-wrapping the
  // *entire* array on every single new frame (visibleRows gets a new array
  // reference each time) is still O(totalRows) allocation work happening
  // on every frame arrival, which is exactly the shape of cost that's
  // invisible at a few hundred rows and dominant at tens of thousands.
  // Since traceRows already only produces a new TraceRow object for a
  // frame that's actually new/changed, wrapping is cached per TraceRow
  // reference the same way.
  const kitRowCacheRef = useRef(new Map<TraceRow, KitTableRow>());

  const kitRows = useMemo<KitTableRow[]>(() => {
    const cache = kitRowCacheRef.current;
    const nextCache = new Map<TraceRow, KitTableRow>();
    const rows = visibleRows.map((row) => {
      let kitRow = cache.get(row);
      if (!kitRow) {
        kitRow = { key: row.key, values: row.values, numericValues: row.numericValues, detail: { kind: "traceRow", data: row } };
      }
      nextCache.set(row, kitRow);
      return kitRow;
    });
    kitRowCacheRef.current = nextCache;
    return rows;
  }, [visibleRows]);

  function handleCellContextMenu(event: MouseEvent, column: KitTableColumn, row: KitTableRow) {
    const trace = traceRowOf(row);
    let field: DecodedField | undefined;
    if (column.id.startsWith("canId:")) field = trace.decoded?.canIdFields.find((item) => item.name === column.id.slice("canId:".length));
    else if (column.id.startsWith("payload:")) field = trace.decoded?.payloadDecodedFields.find((item) => item.name === column.id.slice("payload:".length));
    openCellContextMenu(event, trace.frame, row.key, column.id, row.values[column.id] ?? "", field);
  }

  // Stable identities for the Table props below - see useStableCallback's
  // own comment for why this matters (defeated memoization was the likely
  // cause of unreliable follow-to-bottom scrolling).
  const handleRowSelect = useStableCallback((row: KitTableRow | null) => setSelectedFrameKey(row?.key ?? null));
  const handleRowClassName = useStableCallback((row: KitTableRow) => traceRowClassName(traceRowOf(row)));
  const handleRowContextMenu = useStableCallback((event: MouseEvent, row: KitTableRow) => rowContextMenu(event, traceRowOf(row)));
  const handleCellContextMenuStable = useStableCallback(handleCellContextMenu);
  const handleHeaderContextMenu = useStableCallback((event: MouseEvent, column: KitTableColumn) => openHeaderContextMenu(event, column));

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
        className={`grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-2 sm:p-3 xl:overflow-hidden ${
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

                  <TraceColumnMenu
                    pinnedCanIdColumns={pinnedDynamicColumns.filter((column) => column.kind === "canId")}
                    pinnedPayloadColumns={pinnedDynamicColumns.filter((column) => column.kind === "payloadHeader")}
                    onUnpin={togglePinnedField}
                    payloadDisplayMode={payloadDisplayMode}
                    onPayloadDisplayModeChange={setPayloadDisplayMode}
                  />

                  {suggestedPayloadColumns.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-block">
                          <Button
                            variant={suggestionsVisible ? "secondary" : "ghost"}
                            size="icon"
                            className="h-8 w-8"
                            onClick={toggleSuggestionsVisible}
                          >
                            <Lightbulb className="h-4 w-4" />
                            <span className="sr-only">Suggested columns</span>
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{suggestionsVisible ? "Hide suggested columns" : "Show suggested columns"}</TooltipContent>
                    </Tooltip>
                  )}

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
              <FilterBar
                value={draftSearch}
                onValueChange={setDisplayFilter}
                onCommittedChange={setSearch}
                placeholder="Display filter: canId == 18203C01 and message_good == good"
                inputTitle="Use bare text or field filters: canId == 18203C01, len >= 8, payload ~ 01, command_class == response"
                isValid={draftParsedFilter.valid}
                statusText={filterStatusText()}
                displayMode={filterDisplayMode}
                onDisplayModeChange={setFilterDisplayMode}
                helpContent={
                  <>
                    <p className="m-0">Bare text matches anywhere in the row. Combine field filters with <code>and</code> / <code>or</code>.</p>
                    <div className="mt-2.5 space-y-1.5 font-mono text-[11.5px]">
                      <div><span className="rounded bg-muted px-1.5 py-0.5 text-foreground">canId == 18203C01</span> — exact CAN ID (hex)</div>
                      <div><span className="rounded bg-muted px-1.5 py-0.5 text-foreground">len &gt;= 8</span> — payload length in bytes</div>
                      <div><span className="rounded bg-muted px-1.5 py-0.5 text-foreground">payload ~ 01</span> — payload contains byte(s)</div>
                      <div><span className="rounded bg-muted px-1.5 py-0.5 text-foreground">command_class == response</span> — decoded field match</div>
                      <div><span className="rounded bg-muted px-1.5 py-0.5 text-foreground">canId == 18203C01 and len &gt;= 8</span> — combine with <code>and</code>/<code>or</code></div>
                    </div>
                  </>
                }
                onOpenDocs={openDisplayFilterHelp}
                onTimeFilterChange={(next) => {
                  setDraftSearch(next);
                  setSearch(next);
                }}
                presets={filterPresets}
                onApplyPreset={applyFilterPreset}
                onSavePreset={saveCurrentFilterPreset}
                onDeletePreset={deleteFilterPreset}
                alertRules={alertRules}
                onToggleAlertRule={toggleAlertRule}
                onDeleteAlertRule={deleteAlertRule}
                onAddAlertRuleFromFilter={addAlertRuleFromCurrentFilter}
              />
              {suggestionsVisible && suggestedPayloadColumns.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-3 py-1.5">
                  <span className="text-[11px] text-muted-foreground">Suggested columns:</span>
                  {suggestedPayloadColumns.map((column) => (
                    <button
                      key={column.id}
                      type="button"
                      className="rounded-full border bg-background px-2 py-0.5 text-[11px] hover:bg-accent"
                      onClick={() => togglePinnedField(column.id)}
                    >
                      {column.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="text-[11px] font-medium text-primary hover:underline"
                    onClick={() => addPinnedFields(suggestedPayloadColumns.map((column) => column.id))}
                  >
                    Add all
                  </button>
                  <button
                    type="button"
                    className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={toggleSuggestionsVisible}
                  >
                    Hide
                  </button>
                </div>
              )}
              <CardContent className="min-h-0 min-w-0 flex-1 p-0">
                <Table
                  ref={tableVirtuosoRef}
                  className="h-full"
                  columns={kitColumns}
                  rows={kitRows}
                  sortRules={sortRules}
                  onSortRulesChange={updateSortRules}
                  columnWidths={columnUserWidths}
                  onColumnWidthChange={setColumnUserWidths}
                  onColumnWidthsCommitted={saveTraceColumnWidths}
                  onReorderColumn={moveTraceColumn}
                  selectedRowKey={selectedFrameKey}
                  onRowSelect={handleRowSelect}
                  rowClassName={handleRowClassName}
                  onRowContextMenu={handleRowContextMenu}
                  onCellContextMenu={handleCellContextMenuStable}
                  onHeaderContextMenu={handleHeaderContextMenu}
                  emptyState={noRowsMessage()}
                  defaultRowHeight={45}
                  // "auto" already only follows while the viewport is
                  // genuinely at the bottom - no need to also gate it on
                  // row selection or row count, and doing so was actively
                  // harmful (see the removed scrollToIndex effect's own
                  // comment above).
                  followOutput={status === "connected" && !traceSourceName ? "auto" : false}
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
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto p-3 pt-0">
              <DecodedPreviewPanel
                decoded={selectedDecodedFrame}
                emptyText="Load a profile and select or import frames to decode."
                onOpenMessage={(decoded) => openDecodedInProfile(decoded, selectedFrame)}
                onOpenField={(field, decoded) => openDecodedInProfile(decoded, selectedFrame, field)}
                pinnedFields={pinnedFieldSet}
                onTogglePin={togglePinnedField}
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
          {contextMenu.columnId === "time" && (
            <button type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
              onClick={() => copyText(String(contextMenu.frame.ts_ms))}
              title="The raw millisecond value — paste it into the time-filter picker's Raw (ms) tab"
            >
              Copy Raw Time (ms)
            </button>
          )}
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



