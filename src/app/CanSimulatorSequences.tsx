import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useConnectionStore } from "@/store/connectionStore";
import { useConnectDialogStore } from "@/store/canConnectDialogStore";
import { useUiStore } from "@/store/uiStore";
import { useTransmitDraftStore } from "@/store/transmitDraftStore";
import { resolveProfileReferences, useProfileStore } from "@/profile-editor/store/profileStore";
import { decodeFrameWithProfiles, type DecodedFrame } from "@/profile-editor/decodeProfile";
import type { WsFrame } from "@/can-bridge/ws/types";
import type { CanProfile } from "@/profile-editor/model/profile";
import { CheckCircle2, Clock, Copy, GitBranch, Link2, Pause, Play, Plus, RadioTower, RotateCcw, Send, Trash2, Workflow, XCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { getProfileMessageSchema } from "@/profile-editor/profileAdapter";
import { openJsonFile, saveJsonFile } from "@/profile-editor/tauriFileIO";

type StepType = "send" | "wait" | "cyclic" | "delay" | "branch";
type StepStatus = "idle" | "running" | "sent" | "matched" | "timeout" | "failed" | "skipped" | "complete";
type TimeoutPolicy = "fail" | "continue" | "retry";
type CyclicLatePolicy = "continue" | "stop" | "send-anyway";

type SequenceStep = {
  id: string;
  type: StepType;
  name: string;
  frameRef?: string;
  canId?: string;
  payload?: string;
  iface?: string;
  isFd?: boolean;
  brs?: boolean;
  expect?: string;
  condition?: string;
  timeoutMs?: number;
  retries?: number;
  onTimeout?: TimeoutPolicy;
  delayMs?: number;
  periodMs?: number;
  maxDurationMs?: number;
  stopWhen?: {
    expect?: string;
    condition?: string;
    matches?: number;
  };
  latePolicy?: CyclicLatePolicy;
};

type SequenceDefinition = {
  id: string;
  name: string;
  description?: string;
  steps: SequenceStep[];
};

type RunLogEntry = {
  id: string;
  time: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
};

type StepRunState = Record<string, { status: StepStatus; detail?: string; sent?: number; matched?: number }>;

const STORAGE_KEY = "can-simulator-sequences:v1";
const SELECTED_SEQUENCE_KEY = "can-simulator-sequences:selected-sequence";
const SELECTED_STEP_KEY = "can-simulator-sequences:selected-step";
const RUN_LOG_KEY = "can-simulator-sequences:run-log";
const RUN_STATE_KEY = "can-simulator-sequences:run-state";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function defaultSequence(): SequenceDefinition {
  return {
    id: uid("seq"),
    name: "Start then poll until response",
    description: "Send one frame, wait for a successful response, then cyclically send another frame until the expected response arrives.",
    steps: [
      {
        id: uid("step"),
        type: "send",
        name: "Send frame A once",
        frameRef: "message_a.command",
        canId: "18203C01",
        payload: "01 01",
        isFd: true,
      },
      {
        id: uid("step"),
        type: "wait",
        name: "Wait for response A",
        expect: "message_a.response",
        condition: "message_good == 1",
        timeoutMs: 1000,
        retries: 0,
        onTimeout: "fail",
      },
      {
        id: uid("step"),
        type: "cyclic",
        name: "Cyclic frame B until response",
        frameRef: "message_b.command",
        canId: "14089C01",
        payload: "01 01 07 00 00 00",
        periodMs: 100,
        maxDurationMs: 10000,
        onTimeout: "fail",
        latePolicy: "continue",
        isFd: true,
        stopWhen: {
          expect: "message_b.response",
          condition: "message_good == 1",
          matches: 1,
        },
      },
    ],
  };
}

function loadSequences() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [defaultSequence()];
    const parsed = JSON.parse(stored) as SequenceDefinition[];
    return Array.isArray(parsed) && parsed.length ? parsed : [defaultSequence()];
  } catch {
    return [defaultSequence()];
  }
}

function saveSequences(sequences: SequenceDefinition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sequences, null, 2));
}

function loadRunLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RUN_LOG_KEY) ?? "[]") as RunLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadRunState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RUN_STATE_KEY) ?? "{}") as StepRunState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveRunLog(entries: RunLogEntry[]) {
  localStorage.setItem(RUN_LOG_KEY, JSON.stringify(entries));
}

function saveRunState(state: StepRunState) {
  localStorage.setItem(RUN_STATE_KEY, JSON.stringify(state));
}

function formatCanId(id: number) {
  return id.toString(16).toUpperCase().padStart(id > 0x7ff ? 8 : 3, "0");
}

function parseCanId(value: string | undefined) {
  const parsed = Number.parseInt((value ?? "").trim().replace(/^0x/i, ""), 16);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizePayload(value: string | undefined) {
  return (value ?? "").replace(/[^0-9a-fA-F]/g, "").match(/.{1,2}/g)?.join(" ").toUpperCase() ?? "";
}

function decodedContext(decoded: DecodedFrame | null, frame: WsFrame) {
  const context: Record<string, string | number | boolean | null> = {
    id: frame.id,
    can_id: frame.id,
    canId: formatCanId(frame.id),
    dir: frame.dir,
    iface: frame.iface,
    message: decoded?.frameName ?? decoded?.meaning ?? "",
    frameName: decoded?.frameName ?? "",
    meaning: decoded?.meaning ?? "",
    serviceName: decoded?.serviceName ?? "",
    service_identifier: decoded?.serviceIdentifier ?? null,
    serviceIdentifier: decoded?.serviceIdentifier ?? null,
    attributeName: decoded?.attributeName ?? "",
    attribute_address: decoded?.attributeAddress ?? null,
    attributeAddress: decoded?.attributeAddress ?? null,
    featureName: decoded?.featureName ?? "",
    feature_index: decoded?.featureIndex ?? null,
    featureIndex: decoded?.featureIndex ?? null,
    message_good: decoded?.messageGood == null ? null : Number(decoded.messageGood),
    messageGood: decoded?.messageGood == null ? null : decoded.messageGood,
    error_status: decoded?.errorText ?? null,
    errorCode: decoded?.errorCode ?? null,
  };
  for (const field of decoded?.fields ?? []) {
    context[field.name] = field.physical;
    context[`${field.name}_raw`] = field.raw;
    context[`${field.name}_text`] = field.displayValue;
  }
  return context;
}

function isSafeCondition(expression: string, names: Set<string>) {
  if (!/^[\w\s()+\-*/%<>=!&|?:.,"'\\]+$/.test(expression)) return false;
  if (/[;{}[\]`]/.test(expression)) return false;
  if (/\b(?:function|return|while|for|class|new|this|globalThis|window|document|eval|import|await|async)\b/.test(expression)) return false;
  const withoutStrings = expression.replace(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g, "");
  const foundNames = withoutStrings.match(/\b[A-Za-z_]\w*\b/g) ?? [];
  return foundNames.every((name) => names.has(name) || ["true", "false", "null"].includes(name));
}

function evaluateCondition(expression: string | undefined, context: Record<string, string | number | boolean | null>) {
  if (!expression?.trim()) return true;
  const names = Object.keys(context);
  if (!isSafeCondition(expression, new Set(names))) return false;
  try {
    const fn = new Function(...names, `"use strict"; return Boolean(${expression});`) as (...values: unknown[]) => boolean;
    return fn(...names.map((name) => context[name]));
  } catch {
    return false;
  }
}

function matchesExpected(decoded: DecodedFrame | null, frame: WsFrame, expected?: string) {
  if (!expected?.trim() || expected === "__any_rx") return true;
  const value = expected.trim();
  if (value.startsWith("0x")) return frame.id === Number.parseInt(value.slice(2), 16);
  if (/^[0-9a-fA-F]{3,8}$/.test(value)) return formatCanId(frame.id) === value.toUpperCase().padStart(value.length > 3 ? 8 : 3, "0");
  return [decoded?.frameName, decoded?.meaning, decoded?.serviceName, decoded?.attributeName, decoded?.featureName].some((item) => item === value);
}

function describeFrame(frame: WsFrame, decoded: DecodedFrame | null) {
  const message = decoded?.frameName || decoded?.meaning || decoded?.attributeName || "unknown message";
  const good = decoded?.messageGood == null ? "" : ` message_good=${Number(decoded.messageGood)}`;
  const error = decoded?.errorText ? ` error=${decoded.errorText}` : "";
  return `${formatCanId(frame.id)} ${message}${good}${error}`;
}

function stepIcon(type: StepType) {
  if (type === "send") return Send;
  if (type === "wait") return Clock;
  if (type === "cyclic") return RadioTower;
  if (type === "branch") return GitBranch;
  return Pause;
}

export function CanSimulatorSequences() {
  const status = useConnectionStore((s) => s.status);
  const statusMessage = useConnectionStore((s) => s.statusMessage);
  const subscribedIfaces = useConnectionStore((s) => s.subscribedIfaces);
  const sendFrame = useConnectionStore((s) => s.sendFrame);
  const waitForFrame = useConnectionStore((s) => s.waitForFrame);
  const annotateFrame = useConnectionStore((s) => s.annotateFrame);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const openConnectDialog = useConnectDialogStore((s) => s.openDialog);
  const openConnectionManager = useUiStore((s) => s.openConnectionManager);
  const transmitDraft = useTransmitDraftStore((s) => s.draft);
  const rawProfile = useProfileStore((s) => s.draftProfile ?? s.profile);
  const loadedProfiles = useProfileStore((s) => s.loadedProfiles);
  const profilesForDecode = useMemo(
    () => [rawProfile, ...loadedProfiles].filter(Boolean).map((profile) => resolveProfileReferences(profile as CanProfile, loadedProfiles) ?? profile) as CanProfile[],
    [loadedProfiles, rawProfile],
  );

  const [sequences, setSequences] = useState<SequenceDefinition[]>(loadSequences);
  const [selectedId, setSelectedIdState] = useState(localStorage.getItem(SELECTED_SEQUENCE_KEY) || sequences[0]?.id || "");
  const [selectedStepId, setSelectedStepIdState] = useState(localStorage.getItem(SELECTED_STEP_KEY) || sequences[0]?.steps[0]?.id || "");
  const [runState, setRunStateState] = useState<StepRunState>(loadRunState);
  const [runLog, setRunLogState] = useState<RunLogEntry[]>(loadRunLog);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | undefined>();
  const runningRef = useRef(false);

  const selectedSequence = sequences.find((sequence) => sequence.id === selectedId) ?? sequences[0];
  const selectedStep = selectedSequence?.steps.find((step) => step.id === selectedStepId) ?? selectedSequence?.steps[0];
  const activeIface = subscribedIfaces[0] ?? "vcan0";
  const connected = status === "connected";
  const responseOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const profile of profilesForDecode) {
      const schema = getProfileMessageSchema(profile);
      for (const definition of schema?.messageDefinitions ?? []) {
        const commandClass = definition.match?.canId?.command_class;
        const commandClassText = String(commandClass ?? "").toLowerCase();
        const looksLikeResponse =
          commandClass === 5 ||
          commandClass === 3 ||
          commandClassText === "response" ||
          commandClassText === "event" ||
          commandClassText === "event/notification" ||
          definition.id?.toLowerCase().includes(".response") ||
          definition.id?.toLowerCase().includes(".event") ||
          definition.name?.toLowerCase().includes("response") ||
          definition.name?.toLowerCase().includes("event");
        if (!looksLikeResponse) continue;
        const id = definition.id ?? definition.name ?? definition.label;
        if (!id) continue;
        options.set(id, definition.label ?? definition.name ?? definition.meaning ?? id);
      }
    }
    return Array.from(options.entries()).map(([id, label]) => ({ id, label }));
  }, [profilesForDecode]);

  function setSelectedId(id: string) {
    setSelectedIdState(id);
    localStorage.setItem(SELECTED_SEQUENCE_KEY, id);
  }

  function setSelectedStepId(id: string) {
    setSelectedStepIdState(id);
    localStorage.setItem(SELECTED_STEP_KEY, id);
  }

  function setRunState(next: StepRunState | ((state: StepRunState) => StepRunState)) {
    setRunStateState((state) => {
      const resolved = typeof next === "function" ? next(state) : next;
      saveRunState(resolved);
      return resolved;
    });
  }

  function setRunLog(next: RunLogEntry[] | ((entries: RunLogEntry[]) => RunLogEntry[])) {
    setRunLogState((entries) => {
      const resolved = typeof next === "function" ? next(entries) : next;
      saveRunLog(resolved);
      return resolved;
    });
  }

  function updateSequences(next: SequenceDefinition[]) {
    setSequences(next);
    saveSequences(next);
  }

  function updateSelectedSequence(updater: (sequence: SequenceDefinition) => SequenceDefinition) {
    updateSequences(sequences.map((sequence) => (sequence.id === selectedSequence?.id ? updater(sequence) : sequence)));
  }

  function updateSelectedStep(updater: (step: SequenceStep) => SequenceStep) {
    if (!selectedStep) return;
    updateSelectedSequence((sequence) => ({
      ...sequence,
      steps: sequence.steps.map((step) => (step.id === selectedStep.id ? updater(step) : step)),
    }));
  }

  function log(level: RunLogEntry["level"], message: string) {
    setRunLog((entries) => [
      { id: uid("log"), time: new Date().toLocaleTimeString(), level, message },
      ...entries,
    ].slice(0, 200));
  }

  function setStepStatus(step: SequenceStep, status: StepStatus, detail?: string, counters?: { sent?: number; matched?: number }) {
    setRunState((state) => ({
      ...state,
      [step.id]: { ...state[step.id], status, detail, ...counters },
    }));
  }

  function resetRunState(sequence = selectedSequence) {
    const next: StepRunState = {};
    for (const step of sequence?.steps ?? []) next[step.id] = { status: "idle" };
    setRunState(next);
  }

  function summarizeReceivedDuringWait(step: SequenceStep, startedAt: number, stopWhen = step.stopWhen) {
    const received = useConnectionStore
      .getState()
      .frames
      .filter((frame) => frame.dir === "rx" && frame.ts_ms >= startedAt && frame.iface === activeIface)
      .slice(-5);
    if (!received.length) return "No RX frame was received on the active interface during the wait window.";

    const expected = stopWhen?.expect ?? step.expect;
    const condition = stopWhen?.condition ?? step.condition;
    const details = received.map((frame) => {
      const decoded = decodeFrameWithProfiles(profilesForDecode, frame);
      const expectedMatched = matchesExpected(decoded, frame, expected);
      const conditionMatched = evaluateCondition(condition, decodedContext(decoded, frame));
      const reason = expectedMatched
        ? conditionMatched
          ? "matched"
          : "message matched, condition failed"
        : "different message";
      return `${describeFrame(frame, decoded)} (${reason})`;
    });
    return `Received during wait: ${details.join("; ")}`;
  }

  function matchFrame(step: SequenceStep, frame: WsFrame, stopWhen = step.stopWhen) {
    if (frame.dir !== "rx") return false;
    const decoded = decodeFrameWithProfiles(profilesForDecode, frame);
    const expected = stopWhen?.expect ?? step.expect;
    const condition = stopWhen?.condition ?? step.condition;
    return matchesExpected(decoded, frame, expected) && evaluateCondition(condition, decodedContext(decoded, frame));
  }

  async function waitForMatchingFrame(step: SequenceStep, timeoutMs: number, stopWhen = step.stopWhen) {
    const startedAt = Date.now();
    let frame: WsFrame;
    try {
      frame = await waitForFrame((candidate) => matchFrame(step, candidate, stopWhen), timeoutMs);
    } catch (error) {
      const detail = summarizeReceivedDuringWait(step, startedAt, stopWhen);
      throw new Error(`${error instanceof Error ? error.message : "Timed out waiting for CAN response"}. ${detail}`);
    }
    annotateFrame(
      (candidate) => candidate.line_no === frame.line_no && candidate.ts_ms === frame.ts_ms && candidate.id === frame.id,
      { scenario_name: selectedSequence?.name, scenario_step: step.name, scenario_status: "rx-match" },
    );
    return frame;
  }

  async function runSendStep(step: SequenceStep) {
    const arbitrationId = parseCanId(step.canId);
    if (arbitrationId == null) throw new Error(`${step.name}: invalid CAN ID`);
    const result = await sendFrame({
      iface: activeIface,
      arbitrationId,
      isFd: step.isFd ?? true,
      brs: step.brs ?? (step.isFd ?? true),
      dataHex: normalizePayload(step.payload),
      scenarioName: selectedSequence?.name,
      scenarioStep: step.name,
      scenarioStatus: "tx",
    });
    if (!result.ok) throw new Error(result.error ?? `${step.name}: send failed`);
  }

  async function runWaitStep(step: SequenceStep) {
    const attempts = Math.max(1, (step.retries ?? 0) + 1);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await waitForMatchingFrame(step, step.timeoutMs ?? 1000);
        return;
      } catch (error) {
        const lastAttempt = attempt === attempts;
        if (!lastAttempt && step.onTimeout === "retry") {
          setStepStatus(step, "running", `Retry ${attempt}/${attempts - 1}`);
          log("warning", `${step.name}: timeout, retrying`);
          continue;
        }
        if (step.onTimeout === "continue") {
          log("warning", `${step.name}: timeout, continuing`);
          return;
        }
        throw error;
      }
    }
  }

  async function runCyclicStep(step: SequenceStep) {
    const started = Date.now();
    let sent = 0;
    let matched = 0;
    const targetMatches = Math.max(1, step.stopWhen?.matches ?? 1);
    while (runningRef.current) {
      await runSendStep(step);
      sent += 1;
      setStepStatus(step, "running", `Sent ${sent}, matched ${matched}`, { sent, matched });
      try {
        await waitForMatchingFrame(step, step.periodMs ?? 100, step.stopWhen);
        matched += 1;
        setStepStatus(step, "running", `Sent ${sent}, matched ${matched}`, { sent, matched });
        if (matched >= targetMatches) return;
      } catch {
        if (Date.now() - started >= (step.maxDurationMs ?? 10000)) {
          if (step.onTimeout === "continue") return;
          throw new Error(`${step.name}: timed out waiting for cyclic stop response`);
        }
        if (step.latePolicy === "stop") throw new Error(`${step.name}: response did not arrive within period`);
        if (step.latePolicy !== "send-anyway") {
          await new Promise((resolve) => window.setTimeout(resolve, step.periodMs ?? 100));
        }
      }
    }
  }

  async function runStep(step: SequenceStep) {
    setStepStatus(step, "running");
    log("info", `${step.name}: started`);
    if (step.type === "send") await runSendStep(step);
    if (step.type === "wait") await runWaitStep(step);
    if (step.type === "cyclic") await runCyclicStep(step);
    if (step.type === "delay") await new Promise((resolve) => window.setTimeout(resolve, step.delayMs ?? 100));
    if (step.type === "branch") {
      const expressionResult = evaluateCondition(step.condition, {});
      if (!expressionResult) {
        setStepStatus(step, "skipped", "Condition evaluated false");
        log("warning", `${step.name}: skipped`);
        return;
      }
    }
    setStepStatus(step, step.type === "wait" || step.type === "cyclic" ? "matched" : "complete");
    log("success", `${step.name}: complete`);
  }

  async function runSelectedSequence() {
    if (!selectedSequence || runningRef.current) return;
    runningRef.current = true;
    resetRunState(selectedSequence);
    setRunLog([]);
    log("info", `${selectedSequence.name}: run started`);
    try {
      for (const step of selectedSequence.steps) {
        if (!runningRef.current) break;
        await runStep(step);
      }
      log("success", `${selectedSequence.name}: run complete`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scenario failed";
      log("error", message);
      const runningStep = selectedSequence.steps.find((step) => runState[step.id]?.status === "running");
      if (runningStep) setStepStatus(runningStep, "failed", message);
    } finally {
      runningRef.current = false;
    }
  }

  function stopRun() {
    runningRef.current = false;
    log("warning", "Run stopped manually");
  }

  function addSequence() {
    const next = defaultSequence();
    next.name = `New sequence ${sequences.length + 1}`;
    updateSequences([...sequences, next]);
    setSelectedId(next.id);
    setSelectedStepId(next.steps[0]?.id ?? "");
  }

  function duplicateSequence() {
    if (!selectedSequence) return;
    const copy = structuredClone(selectedSequence);
    copy.id = uid("seq");
    copy.name = `${copy.name} copy`;
    copy.steps = copy.steps.map((step) => ({ ...step, id: uid("step") }));
    updateSequences([...sequences, copy]);
    setSelectedId(copy.id);
    setSelectedStepId(copy.steps[0]?.id ?? "");
  }

  function deleteSequence() {
    if (!selectedSequence || sequences.length === 1) return;
    const next = sequences.filter((sequence) => sequence.id !== selectedSequence.id);
    updateSequences(next);
    setSelectedId(next[0].id);
    setSelectedStepId(next[0].steps[0]?.id ?? "");
  }

  function addStep(type: StepType) {
    const step: SequenceStep = {
      id: uid("step"),
      type,
      name: type === "send" ? "Send once" : type === "wait" ? "Wait for response" : type === "cyclic" ? "Cyclic transmit" : type === "branch" ? "Branch" : "Delay",
      timeoutMs: type === "wait" ? 1000 : undefined,
      periodMs: type === "cyclic" ? 100 : undefined,
      maxDurationMs: type === "cyclic" ? 10000 : undefined,
      onTimeout: type === "wait" || type === "cyclic" ? "fail" : undefined,
      payload: type === "send" || type === "cyclic" ? "00" : undefined,
      canId: type === "send" || type === "cyclic" ? "123" : undefined,
      isFd: type === "send" || type === "cyclic" ? true : undefined,
      delayMs: type === "delay" ? 100 : undefined,
    };
    updateSelectedSequence((sequence) => ({ ...sequence, steps: [...sequence.steps, step] }));
    setSelectedStepId(step.id);
  }

  function deleteStep() {
    if (!selectedStep || !selectedSequence || selectedSequence.steps.length === 1) return;
    const nextSteps = selectedSequence.steps.filter((step) => step.id !== selectedStep.id);
    updateSelectedSequence((sequence) => ({ ...sequence, steps: nextSteps }));
    setSelectedStepId(nextSteps[0]?.id ?? "");
  }

  function pasteDraftIntoSelectedStep() {
    if (!selectedStep || !transmitDraft) return;
    updateSelectedStep((step) => ({
      ...step,
      canId: transmitDraft.canId,
      payload: transmitDraft.payload,
      isFd: transmitDraft.isFd,
      brs: transmitDraft.brs,
      frameRef: step.frameRef || transmitDraft.source || "CAN Monitor frame",
    }));
  }

  function expectedValue(step: SequenceStep) {
    const value = step.type === "cyclic" ? step.stopWhen?.expect : step.expect;
    return value?.trim() || "__any_rx";
  }

  function setExpectedValue(value: string) {
    const nextValue = value === "__any_rx" ? "" : value;
    updateSelectedStep((step) =>
      step.type === "cyclic"
        ? { ...step, stopWhen: { ...step.stopWhen, expect: nextValue } }
        : { ...step, expect: nextValue },
    );
  }

  function currentExpectedOptions(step: SequenceStep) {
    const value = expectedValue(step);
    if (value === "__any_rx" || responseOptions.some((option) => option.id === value)) return responseOptions;
    return [{ id: value, label: value }, ...responseOptions];
  }

  function openJson() {
    setJsonDraft(JSON.stringify(selectedSequence, null, 2));
    setJsonError(undefined);
  }

  async function saveSelectedSequenceJson() {
    if (!selectedSequence) return;
    await saveJsonFile(JSON.stringify(selectedSequence, null, 2), `${selectedSequence.name.replace(/[^a-z0-9_-]+/gi, "_")}.sequence.json`);
  }

  async function saveAllSequencesJson() {
    await saveJsonFile(JSON.stringify(sequences, null, 2), "can-simulator-sequences.json");
  }

  async function loadSequenceJson() {
    const text = await openJsonFile();
    if (!text) return;
    const parsed = JSON.parse(text) as SequenceDefinition | SequenceDefinition[];
    const imported = (Array.isArray(parsed) ? parsed : [parsed]).filter((item) => item?.name && Array.isArray(item.steps));
    if (!imported.length) throw new Error("Sequence JSON must contain a sequence or an array of sequences.");
    const normalized = imported.map((sequence) => ({
      ...sequence,
      id: sequence.id || uid("seq"),
      steps: sequence.steps.map((step) => ({ ...step, id: step.id || uid("step") })),
    }));
    const next = [...sequences, ...normalized];
    updateSequences(next);
    setSelectedId(normalized[0].id);
    setSelectedStepId(normalized[0].steps[0]?.id ?? "");
    log("success", `Loaded ${normalized.length} sequence JSON ${normalized.length === 1 ? "file" : "entries"}`);
  }

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonDraft) as SequenceDefinition;
      if (!parsed.name || !Array.isArray(parsed.steps)) throw new Error("JSON must contain name and steps.");
      updateSequences(sequences.map((sequence) => (sequence.id === selectedSequence?.id ? { ...parsed, id: selectedSequence.id } : sequence)));
      setJsonError(undefined);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Invalid JSON");
    }
  }

  const statusStyle = {
    idle: "secondary",
    running: "default",
    sent: "default",
    matched: "default",
    timeout: "destructive",
    failed: "destructive",
    skipped: "secondary",
    complete: "default",
  } as const;

  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_minmax(420px,1fr)_360px] grid-rows-[minmax(0,1fr)_190px] overflow-hidden bg-muted/20">
      <aside className="min-h-0 border-r bg-background">
        <div className="flex h-12 items-center justify-between border-b px-4">
          <div>
            <div className="text-sm font-semibold">Sequences</div>
            <div className="text-[11px] text-muted-foreground">Reusable TX workflows</div>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={addSequence} title="Add sequence">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="h-[calc(100%-3rem)] overflow-auto p-2">
          {sequences.map((sequence) => (
            <button type="button"
              key={sequence.id}
              className={`mb-2 w-full rounded-md border p-3 text-left hover:bg-muted ${sequence.id === selectedSequence?.id ? "border-primary bg-primary/10" : "bg-card"}`}
              onClick={() => {
                setSelectedId(sequence.id);
                setSelectedStepId(sequence.steps[0]?.id ?? "");
              }}
            >
              <div className="truncate text-sm font-medium">{sequence.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{sequence.steps.length} steps</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-h-0 overflow-auto p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">CAN Simulator Sequences</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Build protocol-neutral send, wait, branch, delay, and cyclic workflows.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {connected ? (
              <Button variant="outline" onClick={() => void disconnect()}>
                <Link2 className="h-4 w-4" />
                Disconnect
              </Button>
            ) : (
              <Button variant="outline" onClick={openConnectDialog}>
                <Link2 className="h-4 w-4" />
                Connect
              </Button>
            )}
            <Button variant="outline" onClick={openConnectionManager}>Connections</Button>
            <Button variant="outline" onClick={() => void loadSequenceJson()}>Load JSON</Button>
            <Button variant="outline" onClick={() => void saveSelectedSequenceJson()}>Save JSON</Button>
            <Button variant="outline" onClick={duplicateSequence}><Copy className="h-4 w-4" /> Duplicate</Button>
            <Button variant="outline" onClick={deleteSequence} disabled={sequences.length === 1}><Trash2 className="h-4 w-4" /> Delete</Button>
            <Button variant="outline" onClick={() => resetRunState()}><RotateCcw className="h-4 w-4" /> Reset</Button>
            <Button variant="destructive" onClick={stopRun}><Pause className="h-4 w-4" /> Stop</Button>
            <Button onClick={() => void runSelectedSequence()} disabled={!connected}><Play className="h-4 w-4" /> Run</Button>
          </div>
        </div>

        <Card className="rounded-lg">
          <CardHeader className="pb-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="space-y-1 text-xs font-medium">
                Sequence name
                <Input value={selectedSequence?.name ?? ""} onChange={(event) => updateSelectedSequence((sequence) => ({ ...sequence, name: event.target.value }))} />
              </label>
              <div className="space-y-1 text-xs font-medium">
                Runtime
                <Badge className="flex h-10 w-full items-center justify-center" variant={connected ? "default" : "secondary"}>
                  {connected ? `Connected: ${activeIface}` : statusMessage}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Input value={selectedSequence?.description ?? ""} placeholder="Description" onChange={(event) => updateSelectedSequence((sequence) => ({ ...sequence, description: event.target.value }))} />
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void saveAllSequencesJson()}>Save all sequences</Button>
              <Button variant="outline" size="sm" onClick={() => void loadSequenceJson()}>Load sequence JSON</Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 grid gap-3">
          {selectedSequence?.steps.map((step, index) => {
            const Icon = stepIcon(step.type);
            const state = runState[step.id] ?? { status: "idle" as StepStatus };
            return (
              <button type="button"
                key={step.id}
                className={`grid grid-cols-[36px_minmax(0,1fr)_120px] items-center gap-3 rounded-lg border bg-background p-3 text-left hover:bg-muted/50 ${step.id === selectedStep?.id ? "border-primary shadow-sm" : ""}`}
                onClick={() => setSelectedStepId(step.id)}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{index + 1}</span>
                    <span className="truncate text-sm font-medium">{step.name}</span>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {step.type === "cyclic" ? `${step.frameRef ?? step.canId ?? "frame"} every ${step.periodMs ?? 100} ms` : step.expect ?? step.frameRef ?? step.condition ?? `${step.delayMs ?? 0} ms`}
                  </div>
                </div>
                <Badge variant={statusStyle[state.status]}>{state.status}</Badge>
              </button>
            );
          })}
        </div>
      </main>

      <aside className="min-h-0 border-l bg-background">
        <Tabs defaultValue="editor" className="flex h-full flex-col" onValueChange={(value) => value === "json" && openJson()}>
          <div className="border-b p-3">
            <div className="mb-3 text-sm font-semibold">Step editor</div>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="editor">Visual</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="editor" className="min-h-0 flex-1 overflow-auto p-4">
            {selectedStep && (
              <div className="space-y-3">
                <label className="space-y-1 text-xs font-medium">
                  Type
                  <Select value={selectedStep.type} onValueChange={(value) => updateSelectedStep((step) => ({ ...step, type: value as StepType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="send">Send once</SelectItem>
                      <SelectItem value="wait">Wait for response</SelectItem>
                      <SelectItem value="cyclic">Send cyclic</SelectItem>
                      <SelectItem value="branch">Branch</SelectItem>
                      <SelectItem value="delay">Delay</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-xs font-medium">
                  Name
                  <Input value={selectedStep.name} onChange={(event) => updateSelectedStep((step) => ({ ...step, name: event.target.value }))} />
                </label>
                {["send", "cyclic"].includes(selectedStep.type) && (
                  <>
                    <div className="flex items-end gap-2">
                      <label className="min-w-0 flex-1 space-y-1 text-xs font-medium">
                        Frame reference
                        <Input value={selectedStep.frameRef ?? ""} placeholder="message.operation.command" onChange={(event) => updateSelectedStep((step) => ({ ...step, frameRef: event.target.value }))} />
                      </label>
                      <Button
                        variant="outline"
                        className="mb-0"
                        disabled={!transmitDraft}
                        title={transmitDraft ? `Paste ${transmitDraft.canId} ${transmitDraft.payload}` : "Right click a CAN Monitor row and use it in the transmit composer first."}
                        onClick={pasteDraftIntoSelectedStep}
                      >
                        Paste TX
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1 text-xs font-medium">
                        CAN ID
                        <Input className="font-mono" value={selectedStep.canId ?? ""} onChange={(event) => updateSelectedStep((step) => ({ ...step, canId: event.target.value }))} />
                      </label>
                      <label className="space-y-1 text-xs font-medium">
                        Active interface
                        <Input value={activeIface} readOnly title="Change the CAN interface from the connection dialog." />
                      </label>
                    </div>
                    <label className="space-y-1 text-xs font-medium">
                      Payload
                      <Input className="font-mono" value={selectedStep.payload ?? ""} onChange={(event) => updateSelectedStep((step) => ({ ...step, payload: event.target.value }))} />
                    </label>
                  </>
                )}
                {["wait", "cyclic"].includes(selectedStep.type) && (
                  <>
                    <label className="space-y-1 text-xs font-medium">
                      Expected response
                      <Select value={expectedValue(selectedStep)} onValueChange={setExpectedValue}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any_rx">Any RX frame on active interface</SelectItem>
                          {currentExpectedOptions(selectedStep).map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {responseOptions.length === 0 && (
                        <span className="block text-[11px] font-normal text-muted-foreground">Load a profile to select named response or event messages.</span>
                      )}
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      Success condition
                      <Input value={selectedStep.type === "cyclic" ? selectedStep.stopWhen?.condition ?? "" : selectedStep.condition ?? ""} placeholder="message_good == 1" onChange={(event) => updateSelectedStep((step) => step.type === "cyclic" ? { ...step, stopWhen: { ...step.stopWhen, condition: event.target.value } } : { ...step, condition: event.target.value })} />
                    </label>
                  </>
                )}
                {selectedStep.type === "wait" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs font-medium">
                      Timeout ms
                      <Input type="number" value={selectedStep.timeoutMs ?? 1000} onChange={(event) => updateSelectedStep((step) => ({ ...step, timeoutMs: Number(event.target.value) }))} />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      Retries
                      <Input type="number" value={selectedStep.retries ?? 0} onChange={(event) => updateSelectedStep((step) => ({ ...step, retries: Number(event.target.value) }))} />
                    </label>
                  </div>
                )}
                {selectedStep.type === "cyclic" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs font-medium">
                      Period ms
                      <Input type="number" value={selectedStep.periodMs ?? 100} onChange={(event) => updateSelectedStep((step) => ({ ...step, periodMs: Number(event.target.value) }))} />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      Max duration ms
                      <Input type="number" value={selectedStep.maxDurationMs ?? 10000} onChange={(event) => updateSelectedStep((step) => ({ ...step, maxDurationMs: Number(event.target.value) }))} />
                    </label>
                  </div>
                )}
                {selectedStep.type === "delay" && (
                  <label className="space-y-1 text-xs font-medium">
                    Delay ms
                    <Input type="number" value={selectedStep.delayMs ?? 100} onChange={(event) => updateSelectedStep((step) => ({ ...step, delayMs: Number(event.target.value) }))} />
                  </label>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => addStep("send")}><Plus className="h-4 w-4" /> Step</Button>
                  <Button variant="outline" onClick={deleteStep} disabled={(selectedSequence?.steps.length ?? 0) <= 1}><Trash2 className="h-4 w-4" /> Remove</Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="ghost" size="sm" onClick={() => addStep("wait")}>Add wait</Button>
                  <Button variant="ghost" size="sm" onClick={() => addStep("cyclic")}>Add cyclic</Button>
                  <Button variant="ghost" size="sm" onClick={() => addStep("delay")}>Add delay</Button>
                  <Button variant="ghost" size="sm" onClick={() => addStep("branch")}>Add branch</Button>
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="json" className="min-h-0 flex-1 overflow-auto p-4">
            <Textarea className="min-h-[520px] font-mono text-xs" value={jsonDraft} onChange={(event) => setJsonDraft(event.target.value)} />
            {jsonError && <div className="mt-2 text-xs text-destructive">{jsonError}</div>}
            <Button className="mt-3 w-full" onClick={applyJson}>Apply JSON</Button>
          </TabsContent>
        </Tabs>
      </aside>

      <section className="col-span-3 border-t bg-background">
        <div className="grid h-full grid-cols-[320px_minmax(0,1fr)]">
          <div className="border-r p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Step types</div>
            <div className="grid grid-cols-2 gap-2">
              {(["send", "wait", "cyclic", "delay", "branch"] as StepType[]).map((type) => (
                <Button key={type} variant="outline" size="sm" onClick={() => addStep(type)}>
                  <Plus className="h-4 w-4" />
                  {type}
                </Button>
              ))}
            </div>
          </div>
          <div className="min-w-0 overflow-auto p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              Run log
              {runLog.some((entry) => entry.level === "error") ? <XCircle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            </div>
            <div className="space-y-1">
              {runLog.length === 0 && <div className="text-sm text-muted-foreground">Run a sequence to see send, wait, match, retry, timeout, and stop events.</div>}
              {runLog.map((entry) => (
                <div key={entry.id} className="grid grid-cols-[84px_80px_minmax(0,1fr)] rounded border bg-muted/20 px-2 py-1 text-xs">
                  <span className="font-mono text-muted-foreground">{entry.time}</span>
                  <span className={entry.level === "error" ? "text-destructive" : entry.level === "success" ? "text-emerald-600 dark:text-emerald-400" : entry.level === "warning" ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground"}>{entry.level}</span>
                  <span className="truncate">{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

