import { useEditorStore } from "@/store/editorStore";
import { usePreviewStore } from "@/store/previewStore";
import { PayloadPreview } from "@/components/PayloadPreview";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export function DerivedFieldEditor({ derivedId }: { derivedId: string }) {
  const { profile, updateProfile } = useEditorStore();
  const { frames, selectedIndex } = usePreviewStore();

  const derived = profile.derivedFields[derivedId];

  const sampleFrame = frames[selectedIndex];

  // Collect available signals (flattened)
  const signals = Object.values(profile.frames).flatMap((f) => Object.values(f.signals));

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Derived Field: {derived.name}</h2>
        <p className="text-sm text-muted-foreground">Adds semantic meaning using signals or expressions</p>
      </div>

      <Separator />

      {/* BASIC */}
      <Card>
        <CardHeader>
          <CardTitle>Definition</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Source Type */}
          <div className="space-y-2">
            <Label>Source Type</Label>
            <Select
              value={derived.source}
              onValueChange={(value) =>
                updateProfile((p) => {
                  const d = p.derivedFields[derivedId];
                  d.source = value as "signal" | "expression";

                  // reset incompatible fields
                  if (value === "signal") {
                    d.expr = undefined;
                  } else {
                    d.signalId = undefined;
                  }
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="signal">Signal</SelectItem>
                <SelectItem value="expression">Expression</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Signal-based */}
          {derived.source === "signal" && (
            <div className="space-y-2">
              <Label>Source Signal</Label>
              <Select
                value={derived.signalId ?? ""}
                onValueChange={(value) =>
                  updateProfile((p) => {
                    p.derivedFields[derivedId].signalId = value;
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select signal" />
                </SelectTrigger>
                <SelectContent>
                  {signals.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Expression-based */}
          {derived.source === "expression" && (
            <div className="space-y-2">
              <Label>Expression</Label>
              <Textarea
                placeholder="e.g. VehicleSpeed > 120"
                value={derived.expr ?? ""}
                onChange={(e) =>
                  updateProfile((p) => {
                    p.derivedFields[derivedId].expr = e.target.value;
                  })
                }
              />
              <p className="text-xs text-muted-foreground">Allowed: + - * / % &gt; &lt; == && || ? :</p>
            </div>
          )}

          {/* Field Type */}
          <div className="space-y-2">
            <Label>Field Type (optional)</Label>
            <Select
              value={derived.fieldTypeId ?? "none"}
              onValueChange={(value) =>
                updateProfile((p) => {
                  p.derivedFields[derivedId].fieldTypeId = value === "none" ? undefined : value;
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {Object.entries(profile.fieldTypes ?? {}).map(([id, ft]) => (
                  <SelectItem key={id} value={id}>
                    {id} ({ft.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* PREVIEW */}
      <Card>
        <CardHeader>
          <CardTitle>Live Preview</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {sampleFrame ? (
            <>
              <div className="text-sm text-muted-foreground">Preview evaluated using selected sample frame</div>

              {/* Raw payload for context */}
              <PayloadPreview data={sampleFrame.data} />

              {/* Placeholder for evaluation result */}
              <div className="rounded-md border p-3 text-sm">
                <strong>Output:</strong> <span className="text-muted-foreground">(evaluation engine wired next)</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No sample frame available</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
