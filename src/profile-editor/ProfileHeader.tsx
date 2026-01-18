import { FileJson, Pencil, Eye, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { ProfileViewMode } from "@/profile-editor/model/profile";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function ProfileHeader() {
  const { profile, viewMode, setViewMode, enterEditMode, cancelEdit, applyEdit, hasBlockingErrors } = useProfileStore();
  const meta = profile?.meta;

  if (!meta) return null;

  return (
    <div className="flex items-center justify-between border-b pb-3">
      <div>
        <h1 className="text-xl font-semibold">{meta.name}</h1>
        {meta.description && <p className="text-sm text-muted-foreground">{meta.description}</p>}
      </div>

      <div className="flex gap-2">
        <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as ProfileViewMode)}>
          <ToggleGroupItem value="visual">
            <Eye className="w-4 h-4 mr-1" />
            Visual
          </ToggleGroupItem>

          <ToggleGroupItem value="json">
            <FileJson className="w-4 h-4 mr-1" />
            JSON
          </ToggleGroupItem>
        </ToggleGroup>

        {viewMode === "visual" || viewMode === "json" ? (
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
