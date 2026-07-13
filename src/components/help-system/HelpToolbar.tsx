import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, RotateCcw, Save, Undo2 } from "lucide-react";
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
  const resetChapter = useHelpContentStore((s) => s.resetSelectedChapter);
  const selectedChapter = useHelpContentStore((s) => s.chapters.find((chapter) => chapter.id === s.selectedChapterId));

  async function confirmSave() {
    if (!window.confirm(`Save help changes for "${selectedChapter?.title ?? "this chapter"}"?`)) return;
    await save();
  }

  async function confirmResetChapter() {
    if (!window.confirm(`Reset "${selectedChapter?.title ?? "this chapter"}" to the default text?`)) return;
    await resetChapter();
  }

  async function confirmReset() {
    if (!window.confirm("Reset the complete help manual to the default markdown? All custom help changes will be removed.")) return;
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

        <Button variant="ghost" size="icon" onClick={confirmSave} disabled={!isDirty || isSaving} title="Save chapter">
          <Save size={16} />
        </Button>

        <Button variant="ghost" size="icon" onClick={confirmResetChapter} disabled={!isDirty} title="Reset chapter">
          <Undo2 size={16} />
        </Button>

        <Button variant="ghost" size="icon" onClick={confirmReset} disabled={!isDirty} title="Reset all help">
          <RotateCcw size={16} />
        </Button>
      </div>

      <HelpSearchResults />
    </div>
  );
});

