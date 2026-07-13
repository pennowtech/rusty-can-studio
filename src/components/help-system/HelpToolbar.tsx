import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Eye, FileDiff, Pencil, RotateCcw, Save, Undo2 } from "lucide-react";
import { HelpSearchInput } from "@/components/help-system/HelpSearchInput";
import { useHelpContentStore } from "./store/helpContentStore";
import { HelpSearchResults } from "./HelpSearchResults";
import { forwardRef } from "react";

export type HelpMode = "view" | "edit" | "diff";

type HelpToolbarProps = {
  mode: HelpMode;
  onModeChange: (mode: HelpMode) => void;
};

export const HelpToolbar = forwardRef<HTMLInputElement, HelpToolbarProps>(function HelpToolbar({ mode, onModeChange }, searchRef) {
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

  function modeButtonClass(value: HelpMode) {
    return mode === value ? "bg-muted text-foreground" : "text-muted-foreground";
  }

  return (
    <div className="flex flex-col border-b">
      <div className="flex min-h-11 flex-wrap items-center gap-2 px-2 py-2">
        <HelpSearchInput ref={searchRef} />

        <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />

        <Button variant="ghost" size="icon" className={modeButtonClass("view")} onClick={() => onModeChange("view")} title="View rendered help">
          <Eye size={16} />
        </Button>

        <Button variant="ghost" size="icon" className={modeButtonClass("edit")} onClick={() => onModeChange("edit")} title="Edit help markdown">
          <Pencil size={16} />
        </Button>

        <Button variant="ghost" size="icon" className={modeButtonClass("diff")} onClick={() => onModeChange("diff")} title="Compare current help with default">
          <FileDiff size={16} />
        </Button>

        <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />

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
