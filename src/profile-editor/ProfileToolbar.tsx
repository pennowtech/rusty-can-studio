import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { Download, Trash2, Upload, Plus } from "lucide-react";
import { useRef } from "react";

function downloadJson(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ProfileToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importJsonTexts = useProfileStore((s) => s.importJsonTexts);
  const exportJson = useProfileStore((s) => s.exportJson);
  const addNewProfile = useProfileStore((s) => s.addNewProfile);
  const activeProfile = useProfileStore((s) => s.draftProfile ?? s.profile);
  const loadedProfiles = useProfileStore((s) => s.loadedProfiles);
  const activeProfileIndex = useProfileStore((s) => s.activeProfileIndex);
  const selectLoadedProfile = useProfileStore((s) => s.selectLoadedProfile);
  const unloadLoadedProfile = useProfileStore((s) => s.unloadLoadedProfile);
  const hasBlockingErrors = useProfileStore((s) => s.hasBlockingErrors);

  async function importFromFiles(files: FileList) {
    importJsonTexts(await Promise.all(Array.from(files).map((file) => file.text())));
  }

  function saveProfile() {
    if (!activeProfile || hasBlockingErrors) {
      void exportJson({ draft: true });
      return;
    }

    downloadJson(`${activeProfile.meta.name || "can-profile"}.json`, JSON.stringify(activeProfile, null, 2));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => fileInputRef.current?.click()}>
        <Upload className="mr-1 h-4 w-4" />
        Load Profile JSON
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

      {loadedProfiles.length > 0 && (
        <>
          <Select value={String(activeProfileIndex)} onValueChange={(value) => selectLoadedProfile(Number(value))}>
            <SelectTrigger className="h-9 w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {loadedProfiles.map((profile, index) => (
                <SelectItem key={`${profile.meta.name}-${index}`} value={String(index)}>
                  {profile.meta.name || `Profile ${index + 1}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" title="Unload selected profile" onClick={() => unloadLoadedProfile(activeProfileIndex)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}

      <Button variant="outline" onClick={saveProfile} disabled={!activeProfile}>
        <Download className="mr-1 h-4 w-4" />
        Save JSON
      </Button>
    </div>
  );
}

