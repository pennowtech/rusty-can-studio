import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { v4 as uuid } from "uuid";
import { useConnectionStore } from "@/store/connectionStore";
import { useAppStore } from "@/store/appShellStore";
import { useUiStore } from "@/store/uiStore";
import type { CanHardwareAdapter, ConnectionProfile, TransportProtocol } from "@/model/connection";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@sbt/desktop-kit/components/ui/popover";
import { HelpCircle, Wrench } from "lucide-react";

const adapterLabels = {
  socketcan: "Generic SocketCAN",
  vcan: "Virtual CAN",
  "peak-pcan": "PEAK PCAN",
  kvaser: "Kvaser",
  vector: "Vector",
  "canable-slcan": "CANable / SLCAN",
  other: "Other SocketCAN adapter",
} as const;

function formatHex(value: number | undefined) {
  return value == null ? "" : value.toString(16).toUpperCase().padStart(8, "0");
}

function parseOptionalHex(value: string) {
  const trimmed = value.trim().replace(/^0x/i, "");
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 16);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bitrateValue(value: number | undefined) {
  return value == null ? "" : String(value);
}

function parseBitrate(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

// A "?" that opens a short explanation plus a deep link to the exact Help
// section — same pattern used both at the dialog's top-right corner and
// inline next to individual sections like the capture filter.
function HelpPopoverButton({
  anchor,
  onNavigate,
  className,
  children,
}: {
  anchor: string;
  onNavigate: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={className} title="Help">
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-[12.5px] leading-normal text-muted-foreground">
        {children}
        <button
          type="button"
          className="mt-3 text-[11.5px] font-medium text-primary hover:underline"
          onClick={() => {
            window.location.hash = anchor;
            onNavigate();
          }}
        >
          Full documentation →
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function CanConnectDialog({
  open,
  onOpenChange,
  editProfileId,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editProfileId?: string;
  onConnected?: () => void;
}) {
  const { profiles, addProfile, updateProfile, connect, discoverRemoteIfaces } = useConnectionStore();
  const setView = useAppStore((s) => s.setView);
  const closeConnectionManager = useUiStore((s) => s.closeConnectionManager);
  const [profile, setProfile] = useState<ConnectionProfile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [remoteIfaces, setRemoteIfaces] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [filterIdText, setFilterIdText] = useState("");
  const [filterMaskText, setFilterMaskText] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testPopoverOpen, setTestPopoverOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRemoteIfaces([]);
    setDiscoveryError(null);
    setTestResult(null);

    if (editProfileId) {
      const existing = profiles.find((item) => item.id === editProfileId);
      if (existing) {
        setProfile(structuredClone(existing));
        setFilterIdText(formatHex(existing.captureFilters?.[0]?.id));
        setFilterMaskText(formatHex(existing.captureFilters?.[0]?.id_mask));
      }
      return;
    }

    const nextProfile: ConnectionProfile = {
      id: uuid(),
      name: "WSL vcan0",
      mode: "remote",
      iface: "vcan0",
      host: "127.0.0.1",
      port: 9501,
      protocol: "ws-json",
      adapter: "vcan",
      fdEnabled: true,
      nominalBitrate: 500000,
      dataBitrate: 2000000,
      autoReconnect: true,
    };
    setProfile(nextProfile);
    setFilterIdText("");
    setFilterMaskText("");
  }, [open, editProfileId, profiles]);

  function validate(nextProfile: ConnectionProfile): string | null {
    if (!nextProfile.name.trim()) return "Name is required";

    if (nextProfile.mode === "local" && !nextProfile.iface?.trim()) {
      return "Interface is required";
    }

    if (nextProfile.nominalBitrate != null && nextProfile.nominalBitrate <= 0) return "Nominal bitrate must be greater than zero";
    if (nextProfile.fdEnabled && nextProfile.dataBitrate != null && nextProfile.dataBitrate <= 0) return "Data bitrate must be greater than zero";

    if (nextProfile.mode === "remote") {
      if (!nextProfile.iface?.trim()) return "Daemon CAN interface is required";
      if (!nextProfile.host?.trim()) return "Host is required";
      if (!nextProfile.port) return "Port is required";
      if (!nextProfile.protocol) return "Protocol is required";
    }

    return null;
  }

  async function saveAndConnect() {
    if (!profile) return;

    const error = validate(profile);
    setValidationError(error);
    if (error) return;

    if (editProfileId) {
      updateProfile(profile);
    } else {
      addProfile(profile);
    }

    onOpenChange(false);
    await connect(profile.id);
    onConnected?.();
  }

  function saveOnly() {
    if (!profile) return;
    const error = validate(profile);
    setValidationError(error);
    if (error) return;
    if (editProfileId) updateProfile(profile);
    else addProfile(profile);
    onOpenChange(false);
  }

  async function discoverIfaces() {
    if (!profile) return;
    setDiscovering(true);
    setDiscoveryError(null);
    try {
      const items = await discoverRemoteIfaces(profile);
      setRemoteIfaces(items);
      if (items.length && !items.includes(profile.iface ?? "")) {
        setProfile({ ...profile, iface: items[0] });
      }
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : "Interface discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  // Reuses the same round-trip discoverRemoteIfaces already makes (connect,
  // list interfaces, disconnect) — it's a real connectivity check, just
  // surfaced here as an explicit pass/fail instead of an interface list, so
  // a user can confirm the daemon is reachable before Save and Connect.
  async function testConnection() {
    if (!profile) return;
    if (!profile.host?.trim() || !profile.port) {
      setTestResult({ ok: false, message: "Enter a host and port first." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const items = await discoverRemoteIfaces(profile);
      setRemoteIfaces(items);
      setTestResult({ ok: true, message: `Daemon reachable — ${items.length} interface${items.length === 1 ? "" : "s"} found.` });
    } catch (error) {
      setTestResult({ ok: false, message: error instanceof Error ? error.message : "Could not reach the daemon." });
    } finally {
      setTesting(false);
    }
  }

  function updateRawFilter(patch: { id?: number; id_mask?: number; is_fd?: boolean | undefined; min_len?: number; max_len?: number }) {
    if (!profile) return;
    const current = profile.captureFilters?.[0] ?? {};
    const next = { ...current, ...patch };
    const empty = next.id == null && next.id_mask == null && next.is_fd == null && next.min_len == null && next.max_len == null;
    setProfile({ ...profile, captureFilters: empty ? [] : [next] });
  }

  if (!profile) return null;

  function goToHelp() {
    setView("help");
    onOpenChange(false);
    closeConnectionManager();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect to CAN</DialogTitle>
        </DialogHeader>

        <HelpPopoverButton
          anchor="setup-remote-daemon-connection"
          onNavigate={goToHelp}
          className="absolute right-11 top-4 rounded-sm text-muted-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <p className="m-0">
            <b className="text-foreground">Remote Daemon</b> connects to a CAN bridge already running elsewhere (WSL or another Linux host). You don't need to set bitrates here — the daemon's SocketCAN interface is already configured with them.
          </p>
          <p className="mt-2 mb-0">
            <b className="text-foreground">Local CAN</b> direct capture isn't wired up yet — use Remote Daemon to connect today.
          </p>
        </HelpPopoverButton>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Connection Name</Label>
            <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </div>

          <Tabs
            value={profile.mode}
            onValueChange={(value) =>
              setProfile({
                ...profile,
                mode: value as "local" | "remote",
                iface: profile.iface ?? (value === "remote" ? "vcan0" : "can0"),
                host: profile.host ?? "127.0.0.1",
                port: profile.port ?? 9501,
                protocol: profile.protocol ?? "ws-json",
                adapter: profile.adapter ?? (value === "remote" ? "vcan" : "socketcan"),
                fdEnabled: profile.fdEnabled ?? true,
                nominalBitrate: profile.nominalBitrate ?? 500000,
                dataBitrate: profile.dataBitrate ?? 2000000,
              })
            }
          >
            <TabsList className="w-full">
              <TabsTrigger value="local" className="flex-1">Local CAN</TabsTrigger>
              <TabsTrigger value="remote" className="flex-1">Remote Daemon</TabsTrigger>
            </TabsList>

            <TabsContent value="local" className="space-y-4">
              <div className="flex flex-col items-center gap-1 rounded-md border border-dashed p-4 text-center">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Local CAN capture isn't wired up yet.</p>
                <p className="text-xs text-muted-foreground">Use Remote Daemon (e.g. WSL) to actually connect today.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Interface</Label>
                  <Input value={profile.iface ?? ""} onChange={(e) => setProfile({ ...profile, iface: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Adapter family</Label>
                  <Select value={profile.adapter ?? "socketcan"} onValueChange={(adapter) => setProfile({ ...profile, adapter: adapter as CanHardwareAdapter })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(adapterLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">CAN timing metadata</div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={profile.fdEnabled ?? true}
                    onCheckedChange={(value) => setProfile({ ...profile, fdEnabled: Boolean(value), dataBitrate: Boolean(value) ? (profile.dataBitrate ?? 2000000) : undefined })}
                  />
                  <Label>CAN-FD interface</Label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Nominal bitrate</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="500000"
                      value={bitrateValue(profile.nominalBitrate)}
                      onChange={(event) => setProfile({ ...profile, nominalBitrate: parseBitrate(event.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Data bitrate</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="2000000"
                      disabled={!profile.fdEnabled}
                      value={bitrateValue(profile.dataBitrate)}
                      onChange={(event) => setProfile({ ...profile, dataBitrate: parseBitrate(event.target.value) })}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="remote" className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Protocol</Label>
                  <Select
                    value={profile.protocol}
                    onValueChange={(value) => setProfile({ ...profile, protocol: value as TransportProtocol })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select protocol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ws-json">WS JSON</SelectItem>
                      <SelectItem value="ws-binary">WS Binary</SelectItem>
                      <SelectItem value="tcp-jsonl">TCP</SelectItem>
                      <SelectItem value="grpc">gRPC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Host</Label>
                  <Input
                    placeholder="127.0.0.1"
                    value={profile.host ?? ""}
                    onChange={(e) => setProfile({ ...profile, host: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={profile.port ?? 9501}
                    onChange={(e) => setProfile({ ...profile, port: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Interfaces</Label>
                  <Button size="sm" variant="outline" className="w-full" disabled={discovering} onClick={() => void discoverIfaces()}>
                    {discovering ? "Discovering" : "Discover"}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Interface</Label>
                  {remoteIfaces.length ? (
                    <Select value={profile.iface ?? ""} onValueChange={(iface) => setProfile({ ...profile, iface })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select interface" />
                      </SelectTrigger>
                      <SelectContent>
                        {remoteIfaces.map((iface) => (
                          <SelectItem key={iface} value={iface}>
                            {iface}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="vcan0"
                      value={profile.iface ?? ""}
                      onChange={(e) => setProfile({ ...profile, iface: e.target.value })}
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Adapter family</Label>
                  <Select value={profile.adapter ?? "vcan"} onValueChange={(adapter) => setProfile({ ...profile, adapter: adapter as CanHardwareAdapter })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(adapterLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {discoveryError && <p className="text-xs text-destructive">{discoveryError}</p>}

              <div className="rounded-md border bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  Daemon capture filter
                  <HelpPopoverButton
                    anchor="reference-daemon-capture-filter"
                    onNavigate={goToHelp}
                    className="rounded-sm normal-case text-muted-foreground opacity-70 transition-opacity hover:opacity-100"
                  >
                    <p className="m-0">
                      Optional — tells the daemon which frames to forward, before they leave the daemon host. Leave both fields empty to receive everything.
                    </p>
                  </HelpPopoverButton>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>CAN ID hex</Label>
                    <Input
                      placeholder="18203C00"
                      value={filterIdText}
                      onChange={(event) => {
                        const value = event.target.value.toUpperCase();
                        setFilterIdText(value);
                        updateRawFilter({ id: parseOptionalHex(value) });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Mask hex</Label>
                    <Input
                      placeholder="1FFFFFFF"
                      value={filterMaskText}
                      onChange={(event) => {
                        const value = event.target.value.toUpperCase();
                        setFilterMaskText(value);
                        updateRawFilter({ id_mask: parseOptionalHex(value) });
                      }}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center space-x-2">
            <Checkbox
              checked={profile.autoReconnect}
              onCheckedChange={(value) => setProfile({ ...profile, autoReconnect: Boolean(value) })}
            />
            <Label>Auto reconnect</Label>
          </div>

          {validationError && <div className="text-sm text-destructive">{validationError}</div>}

          <div className="flex items-center justify-between gap-2">
            <Popover
              open={testPopoverOpen}
              onOpenChange={(next) => {
                setTestPopoverOpen(next);
                if (next) void testConnection();
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={profile.mode === "local"}
                  title={profile.mode === "local" ? "Local CAN cannot connect directly yet. Use Remote Daemon." : undefined}
                >
                  Test Connection
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72">
                {testing ? (
                  <div className="text-sm text-muted-foreground">Testing...</div>
                ) : testResult ? (
                  <>
                    <div className={`text-sm ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{testResult.message}</div>
                    {testResult.ok && remoteIfaces.length > 0 && (
                      <div className="mt-2.5 flex flex-col gap-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Interfaces found — click to use</div>
                        {remoteIfaces.map((iface) => (
                          <button
                            key={iface}
                            type="button"
                            onClick={() => {
                              setProfile({ ...profile, iface });
                              setTestPopoverOpen(false);
                            }}
                            className={`rounded-md border px-2 py-1 text-left font-mono text-xs hover:border-primary hover:text-primary ${profile.iface === iface ? "border-primary text-primary" : ""}`}
                          >
                            {iface}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : null}
              </PopoverContent>
            </Popover>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="outline" onClick={saveOnly}>Save Only</Button>
              <Button disabled={profile.mode === "local"} title={profile.mode === "local" ? "Local CAN cannot connect directly yet. Use Remote Daemon." : undefined} onClick={() => void saveAndConnect()}>
                Save and Connect
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

