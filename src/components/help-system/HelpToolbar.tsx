import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Save, RotateCcw } from "lucide-react";
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
  console.log("🔥 REAL HelpToolbar RENDERED");
  return (
    <div className="border-b flex flex-col">
      {/* 🔝 Toolbar row */}
      <div className="h-11 flex items-center gap-2 px-2">
        <HelpSearchInput ref={searchRef} />

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Preview toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePreview}
          title={previewEnabled ? "Hide Preview" : "Show Preview"}
        >
          {previewEnabled ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>

        {/* Save */}
        <Button variant="ghost" size="icon" onClick={save} disabled={!isDirty || isSaving} title="Save help">
          <Save size={16} />
        </Button>

        {/* Reset */}
        <Button variant="ghost" size="icon" onClick={reset} disabled={!isDirty} title="Reset to default">
          <RotateCcw size={16} />
        </Button>
      </div>

      {/* 🔽 Search results (THIS WAS THE MISSING PART) */}
      <HelpSearchResults />
    </div>
  );
});
