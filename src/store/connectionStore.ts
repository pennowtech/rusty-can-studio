import { WsJsonDaemonClient } from "@/can-bridge/ws/WsJsonDaemonClient";
import type { WsFrame, WsHelloAck } from "@/can-bridge/ws/types";
import type { ConnectionProfile } from "@/model/connection";
import { logDiagnostic } from "@/store/diagnosticsStore";
import { STORAGE_KEY } from "@/utils/consts";
import { create } from "zustand";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type FrameWaiter = {
  matches: (frame: WsFrame) => boolean;
  resolve: (frame: WsFrame) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

type ConnectionState = {
  profiles: ConnectionProfile[];
  activeId?: string;
  status: ConnectionStatus;
  statusMessage?: string;
  daemonInfo?: WsHelloAck;
  availableIfaces: string[];
  subscribedIfaces: string[];
  capturePaused: boolean;
  frames: WsFrame[];
  totalFrames: number;
  nextLineNumber: number;
  traceSourceName?: string;
  traceFrameLimit: number;

  connect: (id: string) => Promise<void>;
  discoverRemoteIfaces: (profile: ConnectionProfile) => Promise<string[]>;
  disconnect: () => Promise<void>;
  pauseCapture: () => Promise<void>;
  resumeCapture: () => Promise<void>;
  clearFrames: () => void;
  loadTraceFrames: (name: string, frames: WsFrame[]) => void;
  sendFrame: (params: {
    iface: string;
    arbitrationId: number;
    isFd: boolean;
    brs?: boolean;
    dataHex: string;
    scenarioName?: string;
    scenarioStep?: string;
    scenarioStatus?: "tx" | "rx-match" | "timeout" | "retry" | "stop";
  }) => Promise<{ ok: boolean; error?: string }>;
  waitForFrame: (matches: (frame: WsFrame) => boolean, timeoutMs: number) => Promise<WsFrame>;
  annotateFrame: (
    matches: (frame: WsFrame) => boolean,
    metadata: Pick<WsFrame, "scenario_name" | "scenario_step" | "scenario_status">,
  ) => void;
  setTraceFrameLimit: (limit: number) => void;

  addProfile: (p: ConnectionProfile) => void;
  updateProfile: (p: ConnectionProfile) => void;
  deleteProfile: (id: string) => void;
  cleanupProfiles: () => void;
};

let activeClient: WsJsonDaemonClient | null = null;
let frameBuffer: WsFrame[] = [];
let frameFlushTimer: number | null = null;
let frameWaiters: FrameWaiter[] = [];

const FRAME_FLUSH_MS = 100;
const DEFAULT_TRACE_FRAME_LIMIT = 500;
const MIN_TRACE_FRAME_LIMIT = 50;
const MAX_TRACE_FRAME_LIMIT = 100000;
let txSequence = 0;

function clampTraceLimit(limit: number) {
  if (!Number.isFinite(limit)) return DEFAULT_TRACE_FRAME_LIMIT;
  return Math.min(MAX_TRACE_FRAME_LIMIT, Math.max(MIN_TRACE_FRAME_LIMIT, Math.floor(limit)));
}

function loadTraceFrameLimit() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY.TRACE_SETTINGS) ?? "{}") as { frameLimit?: unknown };
    return clampTraceLimit(typeof parsed.frameLimit === "number" ? parsed.frameLimit : DEFAULT_TRACE_FRAME_LIMIT);
  } catch {
    return DEFAULT_TRACE_FRAME_LIMIT;
  }
}

function saveTraceFrameLimit(frameLimit: number) {
  localStorage.setItem(STORAGE_KEY.TRACE_SETTINGS, JSON.stringify({ frameLimit }));
}

function limitFrames(frames: WsFrame[], limit: number) {
  return frames.slice(Math.max(0, frames.length - limit));
}

function notifyFrameWaiters(frames: WsFrame[]) {
  for (const frame of frames) {
    for (let index = 0; index < frameWaiters.length; index++) {
      const waiter = frameWaiters[index];
      if (!waiter.matches(frame)) continue;
      frameWaiters.splice(index, 1);
      window.clearTimeout(waiter.timeoutId);
      waiter.resolve(frame);
      index--;
    }
  }
}

function assignLineNumbers(frames: WsFrame[], start: number) {
  let next = start;
  const numbered = frames.map((frame) => {
    if (frame.line_no != null) {
      next = Math.max(next, frame.line_no + 1);
      return frame;
    }
    return { ...frame, line_no: next++ };
  });
  return { numbered, next };
}

function profileKey(profile: ConnectionProfile) {
  return [
    profile.name.trim().toLowerCase(),
    profile.mode,
    profile.iface?.trim().toLowerCase() ?? "",
    profile.host?.trim().toLowerCase() ?? "",
    profile.port ?? "",
    profile.protocol ?? "",
  ].join("|");
}

function dedupeProfiles(profiles: ConnectionProfile[]) {
  const byKey = new Map<string, ConnectionProfile>();
  for (const profile of profiles) {
    byKey.set(profileKey(profile), profile);
  }
  return Array.from(byKey.values());
}

function loadProfiles(): ConnectionProfile[] {
  try {
    const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY.CONNECTIONS) ?? "[]") as ConnectionProfile[];
    const deduped = dedupeProfiles(Array.isArray(loaded) ? loaded : []);
    if (deduped.length !== loaded.length) {
      saveProfiles(deduped);
    }
    return deduped;
  } catch {
    return [];
  }
}

function saveProfiles(profiles: ConnectionProfile[]) {
  localStorage.setItem(STORAGE_KEY.CONNECTIONS, JSON.stringify(profiles));
}

function buildWsJsonUrl(profile: ConnectionProfile): string {
  const host = profile.host?.trim() || "127.0.0.1";
  const port = profile.port || 9501;

  if (host.startsWith("ws://") || host.startsWith("wss://")) {
    return host;
  }

  return `ws://${host}:${port}/ws/text`;
}

function normalizeDataHex(dataHex: string): string {
  return dataHex.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}

async function closeActiveClient() {
  if (!activeClient) return;

  try {
    await activeClient.unsubscribe(1000);
  } catch {
    /* best effort */
  }

  activeClient.close();
  activeClient = null;
  for (const waiter of frameWaiters) {
    window.clearTimeout(waiter.timeoutId);
    waiter.reject(new Error("Connection closed"));
  }
  frameWaiters = [];
  frameBuffer = [];
  if (frameFlushTimer !== null) {
    window.clearTimeout(frameFlushTimer);
    frameFlushTimer = null;
  }
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  profiles: loadProfiles(),
  activeId: undefined,
  status: "disconnected",
  statusMessage: "Disconnected",
  daemonInfo: undefined,
  availableIfaces: [],
  subscribedIfaces: [],
  capturePaused: false,
  frames: [],
  totalFrames: 0,
  nextLineNumber: 1,
  traceSourceName: undefined,
  traceFrameLimit: loadTraceFrameLimit(),

  connect: async (id) => {
    const profile = get().profiles.find((item) => item.id === id);
    if (!profile) {
      set({ status: "error", statusMessage: "Connection profile not found" });
      logDiagnostic({ level: "error", source: "Connection", message: "Connection profile not found", detail: id });
      return;
    }

    await closeActiveClient();
    logDiagnostic({
      level: "info",
      source: "Connection",
      message: `Connecting to ${profile.name}`,
      detail: `${profile.mode} ${profile.host ?? ""}:${profile.port ?? ""} ${profile.iface ?? ""}`.trim(),
    });

    set({
      activeId: id,
      status: "connecting",
      statusMessage: `Connecting to ${profile.name}`,
      daemonInfo: undefined,
      availableIfaces: [],
      subscribedIfaces: [],
      capturePaused: false,
      frames: [],
      totalFrames: 0,
      nextLineNumber: 1,
      traceSourceName: undefined,
    });

    if (profile.mode !== "remote") {
      set({
        status: "error",
        statusMessage: "Local CAN direct capture is not implemented. Use Remote Daemon for WSL.",
      });
      logDiagnostic({ level: "warning", source: "Connection", message: "Local CAN direct capture is not implemented", detail: profile.name });
      return;
    }

    if (profile.protocol !== "ws-json") {
      set({
        status: "error",
        statusMessage: `Protocol ${profile.protocol ?? "unknown"} is not implemented in the UI yet. Use WebSocket JSON.`,
      });
      logDiagnostic({ level: "warning", source: "Connection", message: "Unsupported connection protocol", detail: `${profile.name}: ${profile.protocol ?? "unknown"}` });
      return;
    }

    const attempts = profile.autoReconnect ? 3 : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      set({
        status: "connecting",
        statusMessage: attempts > 1 ? `Connecting to ${profile.name} (${attempt}/${attempts})` : `Connecting to ${profile.name}`,
      });

      const client = new WsJsonDaemonClient(buildWsJsonUrl(profile));
      activeClient = client;
      client.setFrameHandler((frame) => {
        frameBuffer.push(frame);
        if (frameFlushTimer !== null) return;

        frameFlushTimer = window.setTimeout(() => {
          const batch = frameBuffer.splice(0);
          frameFlushTimer = null;
          if (!batch.length) return;

          set((state) => {
            const { numbered, next } = assignLineNumbers(batch, state.nextLineNumber);
            notifyFrameWaiters(numbered);
            return {
              frames: limitFrames([...state.frames, ...numbered], state.traceFrameLimit),
              totalFrames: state.totalFrames + numbered.length,
              nextLineNumber: next,
            };
          });
        }, FRAME_FLUSH_MS);
      });

      try {
        const daemonInfo = await client.connect({ clientName: "cansim-app-rust", timeoutMs: 5000 });
        const ifacesResponse = await client.listIfaces(5000);
        const requestedIface = profile.iface?.trim();
        const subscribedIfaces =
          requestedIface && ifacesResponse.items.includes(requestedIface)
            ? [requestedIface]
            : ifacesResponse.items.length
              ? [ifacesResponse.items[0]]
              : [];

        if (!subscribedIfaces.length) {
          throw new Error("Daemon reported no CAN interfaces. Bring up can0 or vcan0 in WSL and reconnect.");
        }

        await client.subscribe(subscribedIfaces, 5000, profile.captureFilters);

        set({
          status: "connected",
          statusMessage: "Connected",
          daemonInfo,
          availableIfaces: ifacesResponse.items,
          subscribedIfaces,
          capturePaused: false,
        });
        logDiagnostic({ level: "info", source: "Connection", message: `Connected to ${profile.name}`, detail: `Subscribed: ${subscribedIfaces.join(", ")}` });
        return;
      } catch (error) {
        lastError = error;
        logDiagnostic({
          level: attempt < attempts ? "warning" : "error",
          source: "Connection",
          message: `Connection attempt ${attempt}/${attempts} failed`,
          detail: error instanceof Error ? error.message : String(error),
        });
        client.close();
        if (activeClient === client) activeClient = null;
        if (attempt < attempts) {
          await new Promise((resolve) => window.setTimeout(resolve, Math.min(1000 * attempt, 3000)));
        }
      }
    }

    set({
      status: "error",
      statusMessage: lastError instanceof Error ? lastError.message : "Remote daemon connection failed",
      daemonInfo: undefined,
      availableIfaces: [],
      subscribedIfaces: [],
      capturePaused: false,
    });
    logDiagnostic({
      level: "error",
      source: "Connection",
      message: `Failed to connect to ${profile.name}`,
      detail: lastError instanceof Error ? lastError.message : "Remote daemon connection failed",
    });
  },

  discoverRemoteIfaces: async (profile) => {
    if (profile.mode !== "remote") return [];
    const client = new WsJsonDaemonClient(buildWsJsonUrl(profile));
    try {
      await client.connect({ clientName: "cansim-app-rust-discovery", timeoutMs: 3000 });
      const response = await client.listIfaces(3000);
      logDiagnostic({ level: "info", source: "Connection", message: "Discovered remote CAN interfaces", detail: response.items.join(", ") || "No interfaces" });
      return response.items;
    } finally {
      client.close();
    }
  },

  disconnect: async () => {
    await closeActiveClient();
    logDiagnostic({ level: "info", source: "Connection", message: "Disconnected" });
    set({
      activeId: undefined,
      status: "disconnected",
      statusMessage: "Disconnected",
      daemonInfo: undefined,
      availableIfaces: [],
      subscribedIfaces: [],
      capturePaused: false,
    });
  },

  pauseCapture: async () => {
    if (!activeClient) return;

    await activeClient.unsubscribe(3000);
    logDiagnostic({ level: "info", source: "Capture", message: "Capture paused" });
    set({
      subscribedIfaces: [],
      capturePaused: true,
      statusMessage: "Capture paused",
    });
  },

  resumeCapture: async () => {
    const { activeId, profiles, availableIfaces } = get();
    if (!activeClient || !activeId) return;

    const profile = profiles.find((item) => item.id === activeId);
    const requestedIface = profile?.iface?.trim();
    const subscribedIfaces =
      requestedIface && availableIfaces.includes(requestedIface)
        ? [requestedIface]
        : availableIfaces.length
          ? [availableIfaces[0]]
          : [];

    if (!subscribedIfaces.length) {
      set({ status: "error", statusMessage: "No CAN interface is available to resume capture" });
      logDiagnostic({ level: "error", source: "Capture", message: "No CAN interface is available to resume capture" });
      return;
    }

    await activeClient.subscribe(subscribedIfaces, 3000, profile?.captureFilters);
    logDiagnostic({ level: "info", source: "Capture", message: "Capture resumed", detail: subscribedIfaces.join(", ") });
    set({
      subscribedIfaces,
      capturePaused: false,
      status: "connected",
      statusMessage: "Connected",
    });
  },

  clearFrames: () =>
    set((state) => ({
      frames: [],
      totalFrames: 0,
      nextLineNumber: 1,
      traceSourceName: undefined,
      statusMessage:
        state.status === "connected"
          ? "Connected"
          : state.status === "disconnected"
            ? "Disconnected"
            : state.statusMessage,
    })),

  loadTraceFrames: (name, frames) =>
    set(() => {
      const { numbered, next } = assignLineNumbers(frames, 1);
      return {
      frames: numbered,
      totalFrames: numbered.length,
      nextLineNumber: next,
      traceSourceName: name,
      statusMessage: `Loaded ${name}`,
    };
    }),

  sendFrame: async (params) => {
    const txFrame: WsFrame = {
      type: "frame",
      ts_ms: Date.now(),
      iface: params.iface,
      dir: "tx",
      id: params.arbitrationId,
      is_fd: params.isFd,
      data_hex: normalizeDataHex(params.dataHex),
      tx_status: "pending",
      tx_origin: "local",
      tx_sequence: ++txSequence,
      scenario_name: params.scenarioName,
      scenario_step: params.scenarioStep,
      scenario_status: params.scenarioStatus ?? (params.scenarioName ? "tx" : undefined),
    };

    const stateBeforeTx = get();
    const { numbered } = assignLineNumbers([txFrame], stateBeforeTx.nextLineNumber);
    const txFrameWithLine = numbered[0];

    set((state) => ({
      frames: limitFrames([...state.frames, txFrameWithLine], state.traceFrameLimit),
      totalFrames: state.totalFrames + 1,
      nextLineNumber: Math.max(state.nextLineNumber, (txFrameWithLine.line_no ?? state.nextLineNumber) + 1),
      traceSourceName: undefined,
    }));

    if (!activeClient) {
      set({ status: "error", statusMessage: "No remote daemon connection is active" });
      logDiagnostic({
        level: "error",
        source: "Transmit",
        message: "Transmit failed: no remote daemon connection is active",
        detail: `${params.iface} ${params.arbitrationId.toString(16).toUpperCase()}`,
      });
      set((state) => ({
        frames: state.frames.map((frame) =>
          frame.tx_sequence === txFrameWithLine.tx_sequence ? { ...frame, tx_status: "failed", tx_error: "No remote daemon connection is active" } : frame,
        ),
      }));
      return { ok: false, error: "No remote daemon connection is active" };
    }

    try {
      const ack = await activeClient.sendFrame({
        iface: params.iface,
        arbitrationId: params.arbitrationId,
        isFd: params.isFd,
        brs: params.brs,
        dataHex: txFrame.data_hex,
      });

      set((state) => ({
        frames: state.frames.map((frame) =>
          frame.tx_sequence === txFrame.tx_sequence
            ? { ...frame, tx_status: ack.ok ? "sent" : "failed", tx_error: ack.ok ? undefined : ack.error ?? ack.error_message ?? "Daemon rejected CAN frame" }
            : frame,
        ),
        status: ack.ok ? state.status : "error",
        statusMessage: ack.ok ? state.statusMessage : ack.error ?? ack.error_message ?? "Daemon rejected CAN frame",
      }));

      if (!ack.ok) {
        logDiagnostic({
          level: "error",
          source: "Transmit",
          message: "Daemon rejected CAN frame",
          detail: ack.error ?? ack.error_message ?? `${params.iface} ${params.arbitrationId.toString(16).toUpperCase()}`,
        });
      }
      return { ok: ack.ok, error: ack.error ?? ack.error_message };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send CAN frame";
      logDiagnostic({ level: "error", source: "Transmit", message: "Failed to send CAN frame", detail: message });
      set((state) => ({
        status: "error",
        statusMessage: message,
        frames: state.frames.map((frame) =>
          frame.tx_sequence === txFrameWithLine.tx_sequence ? { ...frame, tx_status: "failed", tx_error: message } : frame,
        ),
      }));
      return { ok: false, error: message };
    }
  },

  waitForFrame: (matches, timeoutMs) =>
    new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        frameWaiters = frameWaiters.filter((waiter) => waiter.timeoutId !== timeoutId);
        reject(new Error("Timed out waiting for CAN response"));
      }, timeoutMs);
      frameWaiters.push({ matches, resolve, reject, timeoutId });
    }),

  annotateFrame: (matches, metadata) =>
    set((state) => ({
      frames: state.frames.map((frame) => (matches(frame) ? { ...frame, ...metadata } : frame)),
    })),

  setTraceFrameLimit: (limit) => {
    const traceFrameLimit = clampTraceLimit(limit);
    saveTraceFrameLimit(traceFrameLimit);
    set((state) => ({
      traceFrameLimit,
      frames: state.traceSourceName ? state.frames : limitFrames(state.frames, traceFrameLimit),
    }));
  },

  addProfile: (profile) =>
    set((state) => {
      const key = profileKey(profile);
      const profiles = [...state.profiles.filter((item) => item.id !== profile.id && profileKey(item) !== key), profile];

      saveProfiles(profiles);
      return { profiles };
    }),

  updateProfile: (profile) =>
    set((state) => {
      const profiles = state.profiles.map((item) => (item.id === profile.id ? profile : item));
      saveProfiles(profiles);
      return { profiles };
    }),

  deleteProfile: (id) => {
    const wasActive = get().activeId === id;
    if (wasActive) {
      void closeActiveClient();
    }

    set((state) => {
      const profiles = state.profiles.filter((profile) => profile.id !== id);
      saveProfiles(profiles);
      return {
        profiles,
        activeId: state.activeId === id ? undefined : state.activeId,
        status: state.activeId === id ? "disconnected" : state.status,
        statusMessage: state.activeId === id ? "Disconnected" : state.statusMessage,
        daemonInfo: state.activeId === id ? undefined : state.daemonInfo,
        availableIfaces: state.activeId === id ? [] : state.availableIfaces,
        subscribedIfaces: state.activeId === id ? [] : state.subscribedIfaces,
        capturePaused: state.activeId === id ? false : state.capturePaused,
      };
    });
  },

  cleanupProfiles: () =>
    set((state) => {
      const profiles = dedupeProfiles(state.profiles);
      if (profiles.length === state.profiles.length) return state;

      saveProfiles(profiles);
      return {
        profiles,
        activeId: profiles.some((profile) => profile.id === state.activeId) ? state.activeId : undefined,
      };
    }),
}));
