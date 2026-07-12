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

export function CanConnectDialog({
  open,
  onOpenChange,
  editProfileId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editProfileId?: string;
}) {
  const { profiles, addProfile, updateProfile, connect } = useConnectionStore();
  const [profile, setProfile] = useState<ConnectionProfile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (editProfileId) {
      const existing = profiles.find((item) => item.id === editProfileId);
      if (existing) {
        setProfile(structuredClone(existing));
      }
      return;
    }

    setProfile({
      id: uuid(),
      name: "WSL vcan0",
      mode: "remote",
      iface: "vcan0",
      host: "127.0.0.1",
      port: 9501,
      protocol: "ws-json",
      autoReconnect: true,
    });
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
              <TabsTrigger value="local">Local SocketCAN</TabsTrigger>
              <TabsTrigger value="remote">Remote Daemon</TabsTrigger>
            </TabsList>

            <TabsContent value="local" className="space-y-4">
              <div className="space-y-2">
                <Label>Interface</Label>
                <Input value={profile.iface ?? ""} onChange={(e) => setProfile({ ...profile, iface: e.target.value })} />
                <p className="text-xs text-muted-foreground">Local mode is not wired directly yet. Use Remote Daemon for WSL.</p>
              </div>
            </TabsContent>

            <TabsContent value="remote" className="space-y-4">
              <div className="space-y-2">
                <Label>CAN Interface on Daemon Host</Label>
                <Input
                  placeholder="vcan0"
                  value={profile.iface ?? ""}
                  onChange={(e) => setProfile({ ...profile, iface: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  This interface must exist in WSL where can-bridge-daemon is running.
                </p>
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
            <Button onClick={() => void saveAndConnect()}>Save and Connect</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
