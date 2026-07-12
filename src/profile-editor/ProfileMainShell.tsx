import { Button } from "@/components/ui/button";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { ProfileToolbar } from "@/profile-editor/ProfileToolbar";
import { ProfileHeader } from "@/profile-editor/ProfileHeader";
import { ProfileJsonView } from "@/profile-editor/ProfileJsonView";
import { ProfileMessageEditor } from "@/profile-editor/ProfileMessageEditor";
import { Component, ReactNode } from "react";

class ProfileEditorErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Profile editor render failed:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-xl rounded-lg border bg-background p-4 shadow-sm">
            <div className="text-sm font-semibold">Profile visual view could not render this profile.</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Switch to JSON view and check for missing message definitions, match blocks, or field arrays.
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded bg-muted p-3 text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ProfileMainShell() {
  const profile = useProfileStore((s) => s.profile);
  const draftProfile = useProfileStore((s) => s.draftProfile);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ProfileToolbar />
      {profile || draftProfile ? <ProfileContent /> : <EmptyState />}
    </div>
  );
}

function ProfileContent() {
  const viewMode = useProfileStore((s) => s.viewMode);
  return (
    <div className="min-h-0 flex-1">
      <ProfileHeader />
      <div className="mt-4 h-[calc(100%-3rem)] min-h-0">
        {viewMode === "json" ? (
          <ProfileJsonView />
        ) : (
          <ProfileEditorErrorBoundary>
            <ProfileMessageEditor />
          </ProfileEditorErrorBoundary>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const importJson = useProfileStore((s) => s.importJson);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md rounded-lg border p-6 text-center">
        <div className="text-sm font-medium">No message profile loaded</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Import a profile, or right click a live trace row and choose Define Message Structure to create one from a CAN frame.
        </p>
        <Button className="mt-4" onClick={() => void importJson()}>
          Import JSON Profile
        </Button>
      </div>
    </div>
  );
}
