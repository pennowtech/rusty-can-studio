import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Pencil } from "lucide-react";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { ScopedJsonEditor } from "@/profile-editor/ScopedJsonEditor";

// The full profile document — separate from any per-item (message/
// dictionary/error) scoped JSON view in MessageEditorDrawer etc., which
// each edit just their own subtree. This is the "show/edit the whole file"
// provision. Unlike every other surface (which is always editable via its
// own pencil/inline controls), raw whole-file JSON edits are risky enough
// to keep behind their own explicit "Edit" unlock.
export function ProfileJsonView() {
  const { updateDraftFromJson, draftProfile, profile, jsonError } = useProfileStore();
  const activeProfile = draftProfile ?? profile;
  const [unlocked, setUnlocked] = useState(false);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 justify-end">
        <Button size="sm" variant={unlocked ? "outline" : "default"} disabled={!draftProfile} onClick={() => setUnlocked((v) => !v)}>
          {unlocked ? <Check className="mr-1 h-4 w-4" /> : <Pencil className="mr-1 h-4 w-4" />}
          {unlocked ? "Done" : "Edit"}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <ScopedJsonEditor
          value={JSON.stringify(activeProfile, null, 2)}
          onChange={(v) => {
            if (draftProfile && unlocked) updateDraftFromJson(v);
          }}
          readOnly={!unlocked || !draftProfile}
          error={jsonError}
        />
      </div>
    </div>
  );
}
