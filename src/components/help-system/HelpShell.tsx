import { HelpTOC } from "./HelpTOC";
import { HelpEditor } from "./HelpEditor";
import { HelpPreview } from "./HelpPreview";
import { HelpDiff } from "./HelpDiff";
import { useEffect, useRef } from "react";
import { useHelpStore } from "@/components/help-system/store/helpStore";
import { HelpToolbar } from "./HelpToolbar";
import { useHelpContentStore } from "./store/helpContentStore";
import { HelpChapterList } from "./HelpChapterList";

function isInputFocused() {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || active.getAttribute("contenteditable") === "true";
}

export function HelpShell() {
  const mode = useHelpStore((s) => s.mode);
  const setMode = useHelpStore((s) => s.setMode);
  const searchRef = useRef<HTMLInputElement>(null);
  const moveActive = useHelpStore((s) => s.moveActive);
  const clearSearch = useHelpStore((s) => s.clearSearch);
  const loadHelpContent = useHelpContentStore((s) => s.loadHelp);
  const selectedChapterId = useHelpContentStore((s) => s.selectedChapterId);

  useEffect(() => {
    loadHelpContent();
  }, [loadHelpContent]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const timer = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [mode, selectedChapterId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const platform = navigator.platform || "";
      const isAppleKeyboard = /Mac|iPhone|iPod|iPad/.test(platform);

      if ((isAppleKeyboard ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (e.key === "Escape") {
        clearSearch();
        if (isInputFocused()) {
          (document.activeElement as HTMLElement)?.blur();
        }
        return;
      }

      if (isInputFocused()) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "n" || e.key === "F3") {
        e.preventDefault();
        moveActive(e.shiftKey ? -1 : 1);
        return;
      }

      if (key === "p") {
        e.preventDefault();
        moveActive(-1);
        return;
      }

      if (key === "v") {
        e.preventDefault();
        setMode("view");
        return;
      }

      if (key === "e") {
        e.preventDefault();
        setMode("edit");
        return;
      }

      if (key === "d") {
        e.preventDefault();
        setMode("diff");
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveActive, clearSearch, setMode]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Help and Documentation</h1>
        <p className="text-sm text-muted-foreground">(Editable markdown)</p>
      </header>

      <HelpToolbar ref={searchRef} />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <HelpChapterList />

        <main className="min-h-0 flex-1 overflow-hidden">
          {mode === "view" && <HelpPreview />}
          {mode === "edit" && <HelpEditor />}
          {mode === "diff" && <HelpDiff />}
        </main>

        <aside className="max-h-40 overflow-auto border-t lg:max-h-none lg:w-72 lg:border-l lg:border-t-0">
          <HelpTOC />
        </aside>
      </div>
    </div>
  );
}
