import { useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { findNextFreeBit } from "./canIdUtils";

export function CanIdLayoutEditor({ layoutId }: { layoutId: string }) {
  const { profile, updateProfile, select } = useEditorStore();
  const layout = profile.canIdLayouts[layoutId];

  const [mode, setMode] = useState<"visual" | "json">("visual");

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <h2 className="text-xl font-semibold">CAN ID Layout: {layout.name}</h2>

      {/* Layout settings */}
      <Card>
        <CardHeader>
          <CardTitle>Layout Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm">Format</label>
            <Select
              value={layout.format}
              onValueChange={(v) =>
                updateProfile((p) => {
                  const l = p.canIdLayouts[layoutId];
                  l.format = v as any;
                  if (v === "standard") l.bitLength = 11;
                  if (v === "extended") l.bitLength = 29;
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard (11-bit)</SelectItem>
                <SelectItem value="extended">Extended (29-bit)</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm">Bit Length</label>
            <Input
              type="number"
              disabled={layout.format !== "custom"}
              value={layout.bitLength}
              onChange={(e) =>
                updateProfile((p) => {
                  p.canIdLayouts[layoutId].bitLength = Number(e.target.value);
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Mode selector */}
      <div className="flex gap-2">
        <Button variant={mode === "visual" ? "default" : "outline"} onClick={() => setMode("visual")}>
          Visual Builder
        </Button>
        <Button variant={mode === "json" ? "default" : "outline"} onClick={() => setMode("json")}>
          Import JSON
        </Button>
      </div>

      <>
        <Separator />

        {/* Field list */}
        <Card>
          <CardHeader>
            <CardTitle>Fields</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.values(layout.fields).map((f) => (
              <div key={f.id} className="flex justify-between items-center border rounded px-3 py-2">
                <div>
                  <div className="font-medium">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    bits {f.startBit} → {f.startBit + f.length - 1}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    select({
                      type: "canIdField",
                      layoutId,
                      fieldId: f.id,
                    })
                  }
                >
                  Edit
                </Button>
              </div>
            ))}

            <Button
              variant="secondary"
              onClick={() =>
                updateProfile((p) => {
                  const id = crypto.randomUUID();
                  p.canIdLayouts[layoutId].fields[id] = {
                    id,
                    name: "NewField",
                    startBit: findNextFreeBit(layout),
                    length: 1,
                  };
                })
              }
            >
              + Add Field
            </Button>
          </CardContent>
        </Card>
      </>
    </div>
  );
}

