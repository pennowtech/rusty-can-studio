import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, RotateCcw, Save } from "lucide-react";
import { useHelpStore } from "@/components/help-system/store/helpStore";
import { HelpSearchInput } from "@/components/help-system/HelpSearchInput";
import { useHelpContentStore } from "./store/helpContentStore";
import { HelpSearchResults } from "./HelpSearchResults";
import { forwardRef } from "react";

export const HelpToolbar = forwardRef<HTMLInputElement>(function HelpToolbar(_, searchRef) {
  const previewEnabled = useHelpStore((s) => s.showPreview);
  const togglePreview = useHelpStore((s) => s.togglePreview);

  const isDirty = useHelpContentStore((s) => s.isDirty);
  const isSaving = useHelpContentStore((s) => s.isSaving);
  const save = useHelpContentStore((s) => s.saveCustomMarkdown);
  const reset = useHelpContentStore((s) => s.resetToDefaultMarkdown);

  async function confirmSave() {
    if (!window.confirm("Save the current help markdown changes?")) return;
    await save();
  }

  async function confirmReset() {
    if (!window.confirm("Reset help content to the default markdown? Your custom changes will be removed.")) return;
    await reset();
  }

  return (
    <div className="flex flex-col border-b">
      <div className="flex min-h-11 flex-wrap items-center gap-2 px-2 py-2">
        <HelpSearchInput ref={searchRef} />

        <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />

        <Button variant="ghost" size="icon" onClick={togglePreview} title={previewEnabled ? "Hide Preview" : "Show Preview"}>
          {previewEnabled ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>

        <Button variant="ghost" size="icon" onClick={confirmSave} disabled={!isDirty || isSaving} title="Save help">
          <Save size={16} />
        </Button>

        <Button variant="ghost" size="icon" onClick={confirmReset} disabled={!isDirty} title="Reset to default">
          <RotateCcw size={16} />
        </Button>
      </div>

      <HelpSearchResults />
    </div>
  );
});

