import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { ProfileToolbar } from "@/profile-editor/ProfileToolbar";
import { ProfileHeader } from "@/profile-editor/ProfileHeader";
import { ProfileJsonView } from "@/profile-editor/ProfileJsonView";
import { MessageGallery } from "@/profile-editor/MessageGallery";
import { MessageEditorDrawer } from "@/profile-editor/MessageEditorDrawer";
import { DictionaryEditorDrawer } from "@/profile-editor/DictionaryEditorDrawer";
import { ErrorEditorDrawer } from "@/profile-editor/ErrorEditorDrawer";
import { ProfileTabContent, type ProfileTab } from "@/profile-editor/ProfileTabs";
import { Component, ReactNode } from "react";
import { FileJson, Plus, Upload } from "lucide-react";
import motorGenericProfile from "../../profiles/test/motor-generic.profile.json";
import udsDiagnosticProfile from "../../profiles/test/uds-diagnostic.profile.json";
import j1939EngineProfile from "../../profiles/test/j1939-engine.profile.json";

const DISMISSED_STARTERS_KEY = "cansim.profileEditor.dismissedStarters.v1";

type StarterProfile = {
  id: string;
  data: unknown;
  fileName: string;
};

const STARTER_PROFILES: StarterProfile[] = [
  { id: "motor-generic", data: motorGenericProfile, fileName: "motor-generic.profile.json" },
  { id: "uds-diagnostic", data: udsDiagnosticProfile, fileName: "uds-diagnostic.profile.json" },
  { id: "j1939-engine", data: j1939EngineProfile, fileName: "j1939-engine.profile.json" },
];

function describeStarter(data: any): string {
  const busType = data?.bus?.type ?? "can";
  const variants = Object.values(data?.payload?.variants ?? {}) as unknown[];
  const messageCount = variants.reduce((count: number, entry) => count + (Array.isArray(entry) ? entry.length : 1), 0);
  return `${busType} · ${messageCount} message${messageCount === 1 ? "" : "s"}`;
}

function readDismissedStarters(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_STARTERS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeDismissedStarters(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_STARTERS_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore storage failures (private browsing, quota, etc.)
  }
}

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
            <div className="text-sm font-semibold">Profile view could not render this profile.</div>
            <p className="mt-2 text-sm text-muted-foreground">Open the Full JSON tab and check for missing fields or malformed match blocks.</p>
            <pre className="mt-3 max-h-40 overflow-auto rounded bg-muted p-3 text-xs text-muted-foreground">{this.state.error.message}</pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

type Tab = ProfileTab | "messages" | "full-json";

const TABS: { id: Tab; label: string }[] = [
  { id: "messages", label: "Messages" },
  { id: "profile", label: "Profile" },
  { id: "can-id", label: "CAN ID layout" },
  { id: "payload-header", label: "Payload common" },
  { id: "dictionaries", label: "Dictionaries" },
  { id: "errors", label: "Errors" },
  { id: "full-json", label: "Full JSON" },
];

export function ProfileMainShell() {
  const profile = useProfileStore((s) => s.profile);
  const draftProfile = useProfileStore((s) => s.draftProfile);
  const hasActiveProfile = Boolean(profile || draftProfile);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {hasActiveProfile && <ProfileToolbar />}
      {hasActiveProfile ? <ProfileContent /> : <EmptyState />}
    </div>
  );
}

function ProfileContent() {
  const [tab, setTab] = useState<Tab>("messages");
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  const [openDictionaryKey, setOpenDictionaryKey] = useState<string | null>(null);
  const [openErrorId, setOpenErrorId] = useState<string | null>(null);

  // "Define Message Structure" (right-click a CAN Monitor row) and
  // "open in Profile Editor" (double-click a decoded field) both work by
  // setting this store field and switching the app view here — jump to
  // the Messages tab and open that message's drawer in response. Cleared
  // right after being consumed — otherwise it stays set in the store and
  // this effect re-fires (re-opening the drawer) every time this component
  // remounts, e.g. navigating away from Profile Editor and back.
  const selectedMessageDefinitionId = useProfileStore((s) => s.selectedMessageDefinitionId);
  useEffect(() => {
    if (selectedMessageDefinitionId) {
      setOpenMessageId(selectedMessageDefinitionId);
      setTab("messages");
      useProfileStore.setState({ selectedMessageDefinitionId: undefined });
    }
  }, [selectedMessageDefinitionId]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "full-json" && <ProfileHeader />}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden pt-3">
        <ProfileEditorErrorBoundary>
          {tab === "messages" && <MessageGallery onOpenMessage={setOpenMessageId} openMessageId={openMessageId} />}
          {tab === "full-json" && <ProfileJsonView />}
          {tab !== "messages" && tab !== "full-json" && (
            <div className="h-full overflow-auto">
              <ProfileTabContent tab={tab} onOpenDictionary={setOpenDictionaryKey} onOpenError={setOpenErrorId} />
            </div>
          )}
        </ProfileEditorErrorBoundary>
      </div>

      {openMessageId && <MessageEditorDrawer messageId={openMessageId} onClose={() => setOpenMessageId(null)} />}
      {openDictionaryKey && <DictionaryEditorDrawer dictKey={openDictionaryKey} onClose={() => setOpenDictionaryKey(null)} onRenamed={setOpenDictionaryKey} />}
      {openErrorId && <ErrorEditorDrawer errorId={openErrorId} onClose={() => setOpenErrorId(null)} onRenamed={setOpenErrorId} />}
    </div>
  );
}

function EmptyState() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importJsonText = useProfileStore((s) => s.importJsonText);
  const importJsonTexts = useProfileStore((s) => s.importJsonTexts);
  const addNewProfile = useProfileStore((s) => s.addNewProfile);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissedStarters());

  async function importFromFiles(files: FileList) {
    const fileArray = Array.from(files);
    importJsonTexts(
      await Promise.all(fileArray.map((file) => file.text())),
      fileArray.map((file) => file.name),
    );
  }

  const visibleStarters = STARTER_PROFILES.filter((s) => !dismissed.has(s.id));

  function dismissStarter(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissedStarters(next);
      return next;
    });
  }

  function resetDismissed() {
    setDismissed(new Set());
    writeDismissedStarters(new Set());
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 overflow-auto py-8">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-9 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-primary/10">
          <FileJson className="h-6 w-6 text-primary" />
        </div>
        <div className="text-base font-semibold">No message profile loaded</div>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          A profile maps raw CAN IDs and payload bytes to the fields you actually care about. Import one, start fresh, or
          try one of the starter profiles below.
        </p>
        <div className="mt-5 flex justify-center gap-2.5">
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" />
            Import JSON Profile
          </Button>
          <Button variant="outline" onClick={() => addNewProfile()}>
            <Plus className="mr-1 h-4 w-4" />
            New Profile
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = event.target.files;
              if (files?.length) void importFromFiles(files);
              event.target.value = "";
            }}
          />
        </div>
        <div className="mt-4 border-t pt-4 text-xs text-muted-foreground">
          Or right-click a live trace row in CAN Monitor → <span className="font-medium text-foreground">Define Message Structure</span>
        </div>
      </div>

      {visibleStarters.length > 0 && (
        <div className="w-full max-w-2xl">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Starter profiles</span>
            {dismissed.size > 0 && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={resetDismissed}
              >
                Reset dismissed cards
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {visibleStarters.map((starter) => (
              <div
                key={starter.id}
                role="button"
                tabIndex={0}
                onClick={() => importJsonText(JSON.stringify(starter.data), starter.fileName)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") importJsonText(JSON.stringify(starter.data), starter.fileName);
                }}
                className="group relative cursor-pointer rounded-lg border bg-card p-3.5 text-left transition-colors hover:border-primary"
              >
                <button
                  type="button"
                  title="Remove from starters"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissStarter(starter.id);
                  }}
                  className="absolute right-2 top-2 flex h-[18px] w-[18px] items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                >
                  ✕
                </button>
                <div className="pr-4 text-sm font-medium">{(starter.data as any)?.meta?.name ?? starter.fileName}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{describeStarter(starter.data)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
