import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { HelpTOC } from "./HelpTOC";
import { HelpEditor } from "./HelpEditor";
import { HelpPreview } from "./HelpPreview";
import { HelpDiff } from "./HelpDiff";
import { useEffect, useRef, useState } from "react";
import { useHelpStore } from "@/components/help-system/store/helpStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpToolbar } from "./HelpToolbar";
import { useHelpContentStore } from "./store/helpContentStore";
import { FileQuestionMark } from "lucide-react";
import { HelpSearchInput } from "./HelpSearchInput";

type HelpMode = "view" | "edit" | "diff";

export function HelpShell() {
  const [mode, setMode] = useState<HelpMode>("view");
  const searchRef = useRef<HTMLInputElement>(null);
  const moveActive = useHelpStore((s) => s.moveActive);
  const clearSearch = useHelpStore((s) => s.clearSearch);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

      // Ctrl/Cmd + F → focus Help search
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      // F3 → next match
      if (e.key === "F3" && !e.shiftKey) {
        e.preventDefault();
        moveActive(1);
        return;
      }

      // Shift + F3 → previous match
      if (e.key === "F3" && e.shiftKey) {
        e.preventDefault();
        moveActive(-1);
        return;
      }

      // Esc → clear search (optional global)
      if (e.key === "Escape") {
        clearSearch();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveActive, clearSearch]);

  const loadHelpContent = useHelpContentStore((s) => s.loadHelp);

  useEffect(() => {
    loadHelpContent();
  }, [loadHelpContent]);

  console.log("HelpDialog: rendering in mode", mode);
  return (
    <div className="h-full flex flex-col">
      <Card className="flex-1 rounded-none border-0">
        <CardHeader>
          <CardTitle>Help & Documentation</CardTitle>
        </CardHeader>

        {/* Toolbar */}
        <HelpToolbar ref={searchRef} />

        {/* Mode Tabs */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as HelpMode)}>
          <TabsList className="px-4">
            <TabsTrigger value="view">View</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="diff">Diff</TabsTrigger>
          </TabsList>
        </Tabs>

        <Separator />

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Content */}
          <main className="flex-1 overflow-hidden">
            {mode === "view" && <HelpPreview />}
            {mode === "edit" && <HelpEditor />}
            {mode === "diff" && <HelpDiff />}
          </main>
          {/* TOC */}
          <aside className="w-64 border-l overflow-auto">
            <HelpTOC />
          </aside>
        </div>
      </Card>
    </div>
  );
}
