import { FileJson, Pencil, Check, X, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { ProfileViewMode } from "@/profile-editor/model/profile";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function ProfileHeader() {
  const { profile, viewMode, setViewMode, enterEditMode, cancelEdit, applyEdit, hasBlockingErrors } = useProfileStore();
  const draftProfile = useProfileStore((s) => s.draftProfile);
  const meta = (draftProfile ?? profile)?.meta;

  if (!meta) return null;

  return (
    <div className="flex items-center justify-end border-b pb-3">
      <div className="flex gap-2">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => {
            if (!value) return;
            setViewMode(value as ProfileViewMode);
          }}
        >
          <ToggleGroupItem value="json">
            <FileJson className="w-4 h-4 mr-1" />
            JSON
          </ToggleGroupItem>

          <ToggleGroupItem value="edit">
            <Eye className="w-4 h-4 mr-1" />
            Visual
          </ToggleGroupItem>
        </ToggleGroup>

        {!draftProfile ? (
          <Button size="sm" onClick={enterEditMode}>
            <Pencil className="w-4 h-4 mr-1" />
            Edit
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={applyEdit} disabled={hasBlockingErrors}>
              <Check className="w-4 h-4 mr-1" />
              Apply
            </Button>
            <Button size="sm" variant="outline" onClick={cancelEdit}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

