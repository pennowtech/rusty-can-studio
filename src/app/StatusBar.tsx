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
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <>
      <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1 text-xs text-muted-foreground sm:h-6 sm:flex-nowrap sm:py-0">
        <div className={`min-w-0 flex-1 truncate font-medium ${statusClass}`}>CAN: {statusLabel}</div>
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
