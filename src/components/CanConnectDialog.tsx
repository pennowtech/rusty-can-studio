import { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";
import { useConnectionStore } from "@/store/connectionStore";
import type { ConnectionProfile, TransportProtocol } from "@/model/connection";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function formatHex(value: number | undefined) {
  return value == null ? "" : value.toString(16).toUpperCase().padStart(8, "0");
}

function parseOptionalHex(value: string) {
  const trimmed = value.trim().replace(/^0x/i, "");
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 16);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const [profile, setProfile] = useState<ConnectionProfile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [remoteIfaces, setRemoteIfaces] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [filterIdText, setFilterIdText] = useState("");
  const [filterMaskText, setFilterMaskText] = useState("");

  useEffect(() => {
    if (!open) return;
    setRemoteIfaces([]);
    setDiscoveryError(null);

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

  function updateRawFilter(patch: { id?: number; id_mask?: number; is_fd?: boolean | undefined; min_len?: number; max_len?: number }) {
    if (!profile) return;
    const current = profile.captureFilters?.[0] ?? {};
    const next = { ...current, ...patch };
    const empty = next.id == null && next.id_mask == null && next.is_fd == null && next.min_len == null && next.max_len == null;
    setProfile({ ...profile, captureFilters: empty ? [] : [next] });
  }

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect to CAN</DialogTitle>
        </DialogHeader>

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
              })
            }
          >
            <TabsList>
              <TabsTrigger value="local">Local CAN</TabsTrigger>
              <TabsTrigger value="remote">Remote Daemon</TabsTrigger>
            </TabsList>

            <TabsContent value="local" className="space-y-4">
              <div className="space-y-2">
                <Label>Interface</Label>
                <Input value={profile.iface ?? ""} onChange={(e) => setProfile({ ...profile, iface: e.target.value })} />
                <p className="text-xs text-muted-foreground">Local CAN direct capture is not wired yet. Use Remote Daemon for WSL.</p>
              </div>
            </TabsContent>

            <TabsContent value="remote" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>CAN Interface on Daemon Host</Label>
                  <Button type="button" size="sm" variant="outline" disabled={discovering} onClick={() => void discoverIfaces()}>
                    {discovering ? "Discovering" : "Discover"}
                  </Button>
                </div>
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
                <p className="text-xs text-muted-foreground">
                  This interface must exist in WSL where can-bridge-daemon is running.
                </p>
                {discoveryError && <p className="text-xs text-destructive">{discoveryError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                    <SelectItem value="ws-json">WebSocket JSON</SelectItem>
                    <SelectItem value="ws-binary">WebSocket Binary</SelectItem>
                    <SelectItem value="tcp-jsonl">TCP JSONL</SelectItem>
                    <SelectItem value="grpc">gRPC</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Only WebSocket JSON is connected in the UI right now.</p>
              </div>

              <div className="rounded-md border bg-muted/20 p-3">
                <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Daemon capture filter</div>
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
                <p className="mt-2 text-xs text-muted-foreground">
                  Optional raw filter applied by the daemon before packets are forwarded. Leave empty to receive all subscribed frames.
                </p>
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

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={saveOnly}>Save Only</Button>
            <Button disabled={profile.mode === "local"} title={profile.mode === "local" ? "Local CAN cannot connect directly yet. Use Remote Daemon." : undefined} onClick={() => void saveAndConnect()}>
              Save and Connect
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
