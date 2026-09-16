import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { ScopedJsonEditor } from "@/profile-editor/ScopedJsonEditor";
import { SideDrawer } from "@/profile-editor/SideDrawer";
import type { CanonicalErrorRule } from "@/profile-editor/model/canonicalProfile";
import { resolveProfileReferences, useProfileStore } from "@/profile-editor/store/profileStore";

// Error rules have no dedicated visual form yet (no bit-grid-worthy shared
// shape the way message/CAN-ID fields do) — scoped JSON is the primary
// editor here, just for this one rule instead of the whole profile.
export function ErrorEditorDrawer({ errorId, onClose, onRenamed }: { errorId: string; onClose: () => void; onRenamed: (nextId: string) => void }) {
  const rawProfile = useProfileStore((s) => s.profile);
  const rawDraftProfile = useProfileStore((s) => s.draftProfile);
  const updateDraftProfile = useProfileStore((s) => s.updateDraftProfile);
  const [jsonParseError, setJsonParseError] = useState<string | undefined>();

  const profile = resolveProfileReferences(rawProfile);
  const draftProfile = resolveProfileReferences(rawDraftProfile);
  const activeProfile = draftProfile ?? profile;
  const editable = Boolean(draftProfile);
  const error = activeProfile?.errors?.find((item) => item.id === errorId);

  if (!activeProfile || !error) return null;

  function onJsonChange(text: string) {
    try {
      const parsed = JSON.parse(text) as CanonicalErrorRule;
      setJsonParseError(undefined);
      updateDraftProfile((draft) => {
        const index = (draft.errors ?? []).findIndex((item) => item.id === errorId);
        if (index >= 0 && draft.errors) draft.errors[index] = parsed;
      });
    } catch (e) {
      setJsonParseError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SideDrawer
      onClose={onClose}
      header={
        <>
          <Input
            className="h-8 rounded border-transparent bg-muted/40 px-1.5 font-mono text-base font-semibold shadow-none hover:bg-muted/60 focus-visible:border-ring focus-visible:bg-background"
            value={error.id}
            disabled={!editable}
            onChange={(event) => {
              const newId = event.target.value.trim();
              if (!newId || newId === errorId) return;
              updateDraftProfile((draft) => {
                const target = draft.errors?.find((item) => item.id === errorId);
                if (target) target.id = newId;
              });
              onRenamed(newId);
            }}
          />
          <div className="mt-2 truncate font-mono text-[10.5px] text-muted-foreground" title={error.when}>
            {error.when}
          </div>
        </>
      }
      footer={
        <Button
          variant="outline"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={!editable}
          onClick={() => {
            updateDraftProfile((draft) => {
              draft.errors = (draft.errors ?? []).filter((item) => item.id !== errorId);
            });
            onClose();
          }}
        >
          <Trash2 className="h-4 w-4" />
          Delete error rule
        </Button>
      }
    >
      <div style={{ height: "min(70vh, 640px)" }}>
        <ScopedJsonEditor value={JSON.stringify(error, null, 2)} onChange={onJsonChange} readOnly={!editable} error={jsonParseError} />
      </div>
    </SideDrawer>
  );
}
