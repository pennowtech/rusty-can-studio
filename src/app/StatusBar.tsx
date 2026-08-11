import { CanConnectionManagerDialog } from "@/components/CanConnectionManagerDialog";
import { useConnectionStore } from "@/store/connectionStore";
import { useState } from "react";

export function StatusBar() {
  const { profiles, activeId, status, subscribedIfaces, frames, totalFrames, traceSourceName, daemonInfo, capturePaused } =
    useConnectionStore();
  const active = profiles.find((profile) => profile.id === activeId);
  const [open, setOpen] = useState(false);
  const source = traceSourceName ? `Loaded ${traceSourceName}` : capturePaused ? "Paused live capture" : "Live capture";
  const daemon = daemonInfo?.server_name ?? daemonInfo?.version ?? "No daemon";
  const statusLabel =
    status === "error" ? "Failed" : status === "connected" ? "Connected" : status === "connecting" ? "Connecting" : "Disconnected";
  const statusClass =
    status === "connected"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "connecting"
        ? "text-sky-600 dark:text-sky-400"
        : status === "error"
          ? "text-rose-600 dark:text-rose-400"
          : "text-amber-600 dark:text-amber-500";

  return (
    <>
      <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1 text-xs text-muted-foreground sm:h-6 sm:flex-nowrap sm:py-0">
        <div className={`flex items-center gap-1.5 min-w-0 flex-1 truncate font-medium ${statusClass}`}>
          <span className={`h-2 w-2 rounded-full shrink-0 ${
            status === "connected"
              ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
              : status === "connecting"
                ? "bg-sky-500 animate-pulse shadow-[0_0_8px_rgba(56,189,248,0.6)]"
                : status === "error"
                  ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                  : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
          }`} />
          <span>CAN: {statusLabel}</span>
        </div>
        <div className="hidden max-w-48 truncate md:block">Iface: {subscribedIfaces.join(", ") || "None"}</div>
        <div className="hidden max-w-64 truncate lg:block">Source: {source}</div>
        <div className="hidden max-w-44 truncate xl:block">Daemon: {daemon}</div>
        <div className="shrink-0 truncate" title={`${frames.length} rows retained in the table`}>
          Frames: {totalFrames}
        </div>
        <button type="button" className="max-w-40 shrink-0 truncate hover:underline" onClick={() => setOpen(true)}>
          {active ? active.name : "Disconnected"}
        </button>
      </div>
      <CanConnectionManagerDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
