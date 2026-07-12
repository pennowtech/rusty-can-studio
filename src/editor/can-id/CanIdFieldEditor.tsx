import { useEditorStore } from "@/store/editorStore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function CanIdFieldEditor({ layoutId, fieldId }: { layoutId: string; fieldId: string }) {
  const { profile, updateProfile } = useEditorStore();
  const field = profile.canIdLayouts[layoutId].fields[fieldId];

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <h2 className="text-xl font-semibold">CAN ID Field: {field.name}</h2>

      <Card>
        <CardHeader>
          <CardTitle>Definition</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm">Name</label>
            <Input
              value={field.name}
              onChange={(e) =>
                updateProfile((p) => {
                  p.canIdLayouts[layoutId].fields[fieldId].name = e.target.value;
                })
              }
            />
          </div>

          <div>
            <label className="text-sm">Start Bit</label>
            <Input
              type="number"
              value={field.startBit}
              onChange={(e) =>
                updateProfile((p) => {
                  p.canIdLayouts[layoutId].fields[fieldId].startBit = Number(e.target.value);
                })
              }
            />
          </div>

          <div>
            <label className="text-sm">Length (bits)</label>
            <Input
              type="number"
              value={field.length}
              onChange={(e) =>
                updateProfile((p) => {
                  p.canIdLayouts[layoutId].fields[fieldId].length = Number(e.target.value);
                })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
