import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { HelpTOC } from "./HelpTOC";
import { HelpEditor } from "./HelpEditor";
import { HelpPreview } from "./HelpPreview";
import { HelpDiff } from "./HelpDiff";
import { useState } from "react";
import { useHelpStore } from "@/store/helpStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type HelpMode = "view" | "edit" | "diff";

export function HelpShell() {
  const [mode, setMode] = useState<HelpMode>("view");

  console.log("HelpDialog: rendering in mode", mode);
  return (
    <div className="h-full flex flex-col">
      <Card className="flex-1 rounded-none border-0">
        <CardHeader>
          <CardTitle>Help & Documentation</CardTitle>
        </CardHeader>

        <CardContent className="text-sm text-muted-foreground">
          <p>Welcome to the Help system.</p>
          <p className="mt-2">This area will contain:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Editable Markdown documents</li>
            <li>Live preview</li>
            <li>Table of contents</li>
            <li>Search</li>
            <li>Versioned help entries</li>
          </ul>

          <p className="mt-4 italic">(Content coming next)</p>
        </CardContent>
      </Card>
    </div>
  );
}
