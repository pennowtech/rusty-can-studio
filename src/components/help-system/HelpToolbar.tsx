import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Eye, Pencil, GitCompare, RotateCcw, Save, Undo2 } from "lucide-react";
import { useHelpStore } from "@/components/help-system/store/helpStore";
import { HelpSearchInput } from "@/components/help-system/HelpSearchInput";
import { useHelpContentStore } from "./store/helpContentStore";
import { HelpSearchResults } from "./HelpSearchResults";
import { forwardRef } from "react";
import clsx from "clsx";

export const HelpToolbar = forwardRef<HTMLInputElement>(function HelpToolbar(_, searchRef) {
  const mode = useHelpStore((s) => s.mode);
  const setMode = useHelpStore((s) => s.setMode);

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
    <div className="flex flex-col border-b bg-card">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2">
        <HelpSearchInput ref={searchRef} />

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Mode Action Segmented Buttons with Icons */}
          <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode("view")}
              title="View Mode (v)"
              className={clsx(
                "h-7 gap-1.5 px-2.5 text-xs font-medium transition-all",
                mode === "view" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>View</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode("edit")}
              title="Edit Mode (e)"
              className={clsx(
                "h-7 gap-1.5 px-2.5 text-xs font-medium transition-all",
                mode === "edit" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode("diff")}
              title="Diff Mode (d)"
              className={clsx(
                "h-7 gap-1.5 px-2.5 text-xs font-medium transition-all",
                mode === "diff" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <GitCompare className="h-3.5 w-3.5" />
              <span>Diff</span>
            </Button>
          </div>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* Action Buttons */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={confirmSave}
            disabled={!isDirty || isSaving}
            title="Save chapter"
          >
            <Save className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={confirmResetChapter}
            disabled={!isDirty}
            title="Reset chapter"
          >
            <Undo2 className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={confirmReset}
            disabled={!isDirty}
            title="Reset all help"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <HelpSearchResults />
    </div>
  );
});
