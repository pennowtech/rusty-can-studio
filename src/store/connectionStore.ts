import { WsJsonDaemonClient } from "@/can-bridge/ws/WsJsonDaemonClient";
import type { WsFrame, WsHelloAck } from "@/can-bridge/ws/types";
import type { ConnectionProfile } from "@/model/connection";
import { STORAGE_KEY } from "@/utils/consts";
import { create } from "zustand";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

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
  traceSourceName?: string;
  traceFrameLimit: number;

  connect: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;
  pauseCapture: () => Promise<void>;
  resumeCapture: () => Promise<void>;
  clearFrames: () => void;
  loadTraceFrames: (name: string, frames: WsFrame[]) => void;
  sendFrame: (params: { iface: string; arbitrationId: number; isFd: boolean; brs?: boolean; dataHex: string }) => Promise<{ ok: boolean; error?: string }>;
  setTraceFrameLimit: (limit: number) => void;

  addProfile: (p: ConnectionProfile) => void;
  updateProfile: (p: ConnectionProfile) => void;
  deleteProfile: (id: string) => void;
  cleanupProfiles: () => void;
};

let activeClient: WsJsonDaemonClient | null = null;
let frameBuffer: WsFrame[] = [];
let frameFlushTimer: number | null = null;

const FRAME_FLUSH_MS = 100;
const DEFAULT_TRACE_FRAME_LIMIT = 500;
const MIN_TRACE_FRAME_LIMIT = 50;
const MAX_TRACE_FRAME_LIMIT = 50000;
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
  traceSourceName: undefined,
  traceFrameLimit: loadTraceFrameLimit(),

  connect: async (id) => {
    const profile = get().profiles.find((item) => item.id === id);
    if (!profile) {
      set({ status: "error", statusMessage: "Connection profile not found" });
      return;
    }

    await closeActiveClient();

    set({
      activeId: id,
      status: "connecting",
      statusMessage: `Connecting to ${profile.name}`,
      daemonInfo: undefined,
      availableIfaces: [],
      subscribedIfaces: [],
      capturePaused: false,
      frames: [],
      traceSourceName: undefined,
    });

    if (profile.mode !== "remote") {
      set({
        status: "error",
        statusMessage: "Local SocketCAN requires the daemon bridge. Create a remote daemon profile for WSL.",
      });
      return;
    }

    if (profile.protocol !== "ws-json") {
      set({
        status: "error",
        statusMessage: `Protocol ${profile.protocol ?? "unknown"} is not implemented in the UI yet. Use WebSocket JSON.`,
      });
      return;
    }

    const client = new WsJsonDaemonClient(buildWsJsonUrl(profile));
    activeClient = client;
    client.setFrameHandler((frame) => {
      frameBuffer.push(frame);
      if (frameFlushTimer !== null) return;

      frameFlushTimer = window.setTimeout(() => {
        const batch = frameBuffer.splice(0);
        frameFlushTimer = null;
        if (!batch.length) return;

        set((state) => ({
          frames: limitFrames([...state.frames, ...batch], state.traceFrameLimit),
        }));
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

      await client.subscribe(subscribedIfaces, 5000);

      set({
        status: "connected",
        statusMessage: `Subscribed to ${subscribedIfaces.join(", ")}`,
        daemonInfo,
        availableIfaces: ifacesResponse.items,
        subscribedIfaces,
        capturePaused: false,
      });
    } catch (error) {
      client.close();
      if (activeClient === client) activeClient = null;

      set({
        status: "error",
        statusMessage: error instanceof Error ? error.message : "Remote daemon connection failed",
        daemonInfo: undefined,
        availableIfaces: [],
        subscribedIfaces: [],
        capturePaused: false,
      });
    }
  },

  disconnect: async () => {
    await closeActiveClient();
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
      return;
    }

    await activeClient.subscribe(subscribedIfaces, 3000);
    set({
      subscribedIfaces,
      capturePaused: false,
      status: "connected",
      statusMessage: `Subscribed to ${subscribedIfaces.join(", ")}`,
    });
  },

  clearFrames: () =>
    set((state) => ({
      frames: [],
      traceSourceName: undefined,
      statusMessage:
        state.status === "connected"
          ? state.subscribedIfaces.length
            ? `Subscribed to ${state.subscribedIfaces.join(", ")}`
            : "Connected"
          : state.status === "disconnected"
            ? "Disconnected"
            : state.statusMessage,
    })),

  loadTraceFrames: (name, frames) =>
    set({
      frames,
      traceSourceName: name,
      statusMessage: `Loaded ${name}`,
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
    };

    set((state) => ({
      frames: limitFrames([...state.frames, txFrame], state.traceFrameLimit),
      traceSourceName: undefined,
    }));

    if (!activeClient) {
      set({ status: "error", statusMessage: "No remote daemon connection is active" });
      set((state) => ({
        frames: state.frames.map((frame) =>
          frame.tx_sequence === txFrame.tx_sequence ? { ...frame, tx_status: "failed", tx_error: "No remote daemon connection is active" } : frame,
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
            ? { ...frame, tx_status: ack.ok ? "sent" : "failed", tx_error: ack.ok ? undefined : ack.error ?? "Daemon rejected CAN frame" }
            : frame,
        ),
        status: ack.ok ? state.status : "error",
        statusMessage: ack.ok ? `Sent ${txFrame.iface} ${txFrame.id.toString(16).toUpperCase()}` : ack.error ?? "Daemon rejected CAN frame",
      }));

      return { ok: ack.ok, error: ack.error };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send CAN frame";
      set((state) => ({
        status: "error",
        statusMessage: message,
        frames: state.frames.map((frame) =>
          frame.tx_sequence === txFrame.tx_sequence ? { ...frame, tx_status: "failed", tx_error: message } : frame,
        ),
      }));
      return { ok: false, error: message };
    }
  },

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
