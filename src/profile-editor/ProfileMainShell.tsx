// profile/ProfileViewer.tsx
import { useState } from "react";

import { useProfileStore } from "@/profile-editor/store/profileStore";
import { ProfileViewerToolbar } from "@/profile-editor/ProfileViewerToolbar";
import { ProfileHeader } from "@/profile-editor/ProfileHeader";
import { ProfileJsonView } from "@/profile-editor/ProfileJsonView";
import { ProfileViewMode } from "@/profile-editor/model/profile";
import { ProfileVisualView } from "@/profile-editor/ProfileVisualView";

export function ProfileMainShell() {
  const profile = useProfileStore((s) => s.profile);

  return (
    <div className="space-y-6">
      <ProfileViewerToolbar />
      {profile ? <ProfileContent /> : <EmptyState />}
    </div>
  );
}

function ProfileContent() {
  const { viewMode } = useProfileStore();
  return (
    <div>
      <ProfileHeader />
      {viewMode === "visual" ? (
        <ProfileVisualView />
      ) : viewMode === "json" ? (
        <ProfileJsonView />
      ) : (
        <ProfileVisualView />
      )}
    </div>
  );
}

function EmptyState() {
  return <div className="text-muted-foreground text-sm">No profile loaded. Import a JSON profile to begin.</div>;
}
