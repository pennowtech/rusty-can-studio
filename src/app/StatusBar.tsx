import { CanConnectionManagerDialog } from "@/components/CanConnectionManagerDialog";
import { useTheme } from "@/components/ThemeProvider";
import { useConnectionStore } from "@/store/connectionStore";
import { useState } from "react";

export function StatusBar() {
  const { theme, palette, density } = useTheme();
  const { profiles, activeId, status, statusMessage, subscribedIfaces, frames, traceSourceName, daemonInfo, capturePaused } =
    useConnectionStore();
  const active = profiles.find((profile) => profile.id === activeId);
  const [open, setOpen] = useState(false);
  const source = traceSourceName ? `Loaded ${traceSourceName}` : capturePaused ? "Paused live capture" : "Live capture";
  const daemon = daemonInfo?.server_name ?? daemonInfo?.version ?? "No daemon";

  return (
    <>
      <div className="flex h-6 min-w-0 items-center gap-4 border-t px-3 text-xs text-muted-foreground">
        <div className="min-w-0 flex-1 truncate">CAN: {statusMessage ?? status}</div>
        <div className="hidden max-w-48 truncate md:block">Iface: {subscribedIfaces.join(", ") || "None"}</div>
        <div className="hidden max-w-64 truncate lg:block">Source: {source}</div>
        <div className="hidden max-w-44 truncate xl:block">Daemon: {daemon}</div>
        <div className="shrink-0 truncate">Frames: {frames.length}</div>
        <div className="hidden shrink-0 truncate sm:block">Theme: {theme} / {palette} / {density}</div>
        <button className="max-w-40 shrink-0 truncate hover:underline" onClick={() => setOpen(true)}>
          {active ? active.name : "Disconnected"}
        </button>
      </div>
      <CanConnectionManagerDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
