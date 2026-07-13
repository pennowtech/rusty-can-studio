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
                }`}
                onClick={() => void connect(p.id)}
              >
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {p.name}
                    {p.id === activeId && <Badge variant="default">Active</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.mode === "local" ? `Local (${p.iface})` : `Remote (${p.protocol}://${p.host}:${p.port})`}
                  </div>
                </div>

                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Copy profile"
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
                  <Button size="icon" variant="ghost" onClick={() => setEditingProfileId(p.id)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
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
