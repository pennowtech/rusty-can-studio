import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfileStore } from "@/profile-editor/store/profileStore";

// Editing is ambient now — a draft is kept alive automatically whenever a
// profile is loaded (see draftFrom in profileStore), so there's no separate
// "Edit" gate here any more. This header only offers Apply/Cancel for the
// session's accumulated edits. The Full JSON tab keeps its own local
// "Edit" toggle (ProfileJsonView) since editing the raw whole-file JSON
// is risky enough to still want an explicit unlock.
export function ProfileHeader() {
  const { cancelEdit, applyEdit, hasBlockingErrors } = useProfileStore();
  const draftProfile = useProfileStore((s) => s.draftProfile);

  if (!draftProfile) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" onClick={applyEdit} disabled={hasBlockingErrors}>
        <Check className="w-4 h-4 mr-1" />
        Apply
      </Button>
      <Button size="sm" variant="outline" onClick={cancelEdit}>
        <X className="w-4 h-4 mr-1" />
        Cancel
      </Button>
    </div>
  );
}
