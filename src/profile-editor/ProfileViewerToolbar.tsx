import { Button } from "@/components/ui/button";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { Download, Upload } from "lucide-react";

export function ProfileViewerToolbar() {
  const importJson = useProfileStore((s) => s.importJson);
  const exportJson = useProfileStore((s) => s.exportJson);

  return (
    <div className="flex gap-2">
      <Button onClick={importJson}>
        <Upload className="w-4 h-4 mr-1" />
        Import JSON
      </Button>{" "}
      <Button variant="outline" onClick={() => exportJson()}>
        <Download className="w-4 h-4 mr-1" />
        Save
      </Button>
    </div>
  );
}
