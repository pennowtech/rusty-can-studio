/**
 * CanConnectionManagerDialog.tsx
 * ------------------------------------------------------------
 * Dialog for managing CAN connection profiles.
 *
 * RESPONSIBILITY
 * - Lists saved connection profiles
 * - Allows activating, editing, and deleting profiles
 * - Provides access to create new profiles
 * - Uses ConnectDialog for creating/editing profiles
 *
 * CONVENTIONS
 * - Uses Zustand for state management
 * - Highlights active connection profile
 * - Confirms deletion of profiles
 * - Reuses ConnectDialog for both new and edit actions
 *
 * HOW TO USE
 * - Import and include <CanConnectionManagerDialog /> in the application
 * - Control visibility via `open` prop and `onOpenChange` callback
 * - Profiles are managed via useConnectionStore
 */

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { useConnectionStore } from "@/store/connectionStore";
import { CanConnectDialog } from "./CanConnectDialog";
import { Copy, Pencil, Trash2, Plus } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { v4 as uuid } from "uuid";

const adapterLabels: Record<string, string> = {
  socketcan: "SocketCAN",
  vcan: "Virtual CAN",
  "peak-pcan": "PEAK PCAN",
  kvaser: "Kvaser",
  vector: "Vector",
  "canable-slcan": "CANable/SLCAN",
  other: "Other",
};

function timingLabel(profile: { fdEnabled?: boolean; nominalBitrate?: number; dataBitrate?: number }) {
  if (!profile.nominalBitrate && !profile.dataBitrate) return "Timing not recorded";
  if (profile.fdEnabled === false) return `Classic CAN ${profile.nominalBitrate ?? "-"} bit/s`;
  return `CAN-FD ${profile.nominalBitrate ?? "-"} / ${profile.dataBitrate ?? "-"} bit/s`;
}

export function CanConnectionManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { profiles, activeId, connect, deleteProfile, cleanupProfiles, addProfile } = useConnectionStore();

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const handleConnect = async (profileId: string, profileName: string) => {
    setConnectingId(profileId);
    try {
      await connect(profileId);
      const connectionStore = useConnectionStore.getState();
      if (connectionStore.status === "connected") {
        window.alert(`Successfully connected to "${profileName}"!`);
        onOpenChange(false);
      } else {
        window.alert(`Connection to "${profileName}" failed:\n${connectionStore.statusMessage}`);
      }
    } catch (err: any) {
      window.alert(`Connection to "${profileName}" failed with error:\n${err.message || err}`);
    } finally {
      setConnectingId(null);
    }
  };

  useEffect(() => {
    if (open) cleanupProfiles();
  }, [open, cleanupProfiles]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <VisuallyHidden>
          <DialogTitle>Connection Profiles</DialogTitle>
          <DialogDescription>Manage your saved CAN connection profiles</DialogDescription>
        </VisuallyHidden>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connection Profiles</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {profiles.length === 0 && <div className="text-sm text-muted-foreground">No saved connections</div>}

            {profiles.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-md border p-3 cursor-pointer ${
                  p.id === activeId ? "bg-muted" : "hover:bg-muted/50"
                } ${connectingId === p.id ? "border-sky-500 bg-sky-500/5 dark:bg-sky-500/10" : ""} ${connectingId ? "pointer-events-none opacity-60" : ""}`}
                onClick={() => {
                  if (!connectingId) void handleConnect(p.id, p.name);
                }}
              >
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {p.name}
                    {p.id === activeId && <Badge variant="default">Active</Badge>}
                    {connectingId === p.id && (
                      <Badge variant="outline" className="animate-pulse border-sky-500/40 text-sky-600 dark:text-sky-400">
                        Connecting...
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.mode === "local" ? `Local (${p.iface})` : `Remote (${p.protocol}://${p.host}:${p.port})`}
                  </div>
                  <div className="text-xs text-muted-foreground">Adapter: {adapterLabels[p.adapter ?? "socketcan"] ?? p.adapter}</div>
                  <div className="text-xs text-muted-foreground">{timingLabel(p)}</div>
                </div>

                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Copy profile"
                    disabled={connectingId !== null}
                    onClick={() =>
                      addProfile({
                        ...structuredClone(p),
                        id: uuid(),
                        name: `${p.name} Copy`,
                      })
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={connectingId !== null} onClick={() => setEditingProfileId(p.id)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={connectingId !== null}
                    onClick={() => {
                      if (confirm(`Delete connection "${p.name}"?`)) {
                        deleteProfile(p.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={() => setShowNew(true)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Connection
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reuse ConnectDialog for NEW */}
      <CanConnectDialog
        open={showNew}
        onOpenChange={setShowNew}
        onConnected={() => {
          setShowNew(false);
          onOpenChange(false);
        }}
      />

      {/* Reuse ConnectDialog for EDIT */}
      {editingProfileId && (
        <CanConnectDialog
          open={true}
          onOpenChange={() => setEditingProfileId(null)}
          editProfileId={editingProfileId}
          onConnected={() => {
            setEditingProfileId(null);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}

