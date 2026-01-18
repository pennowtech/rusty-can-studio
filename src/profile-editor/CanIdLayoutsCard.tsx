import { AlertTriangle, Plus, Trash } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { Badge } from "@/components/ui/badge";
import { validateCanIdLayout } from "@/profile-editor/validation/validateCanIdLayout";
import { mapBitErrors } from "@/profile-editor//validation/mapBitErrors";
import { CanIdBitGridEditor } from "@/profile-editor/bit-strip/CanIdBitGridEditor";

export function CanIdLayoutsCard() {
  const mode = useProfileStore((s) => s.viewMode);
  const profile = useProfileStore((s) => (s.viewMode === "edit" ? s.draftProfile : s.profile));
  const updateDraftProfile = useProfileStore((s) => s.updateDraftProfile);

  if (!profile) return null;

  return (
    <Card>
      <CardHeader className="flex justify-between items-center">
        <span className="font-semibold">CAN ID Layouts</span>

        {mode === "edit" && (
          <Button
            size="sm"
            onClick={() =>
              updateDraftProfile((draft) => {
                const id = `layout_${Date.now()}`;
                draft.canIdLayouts[id] = {
                  id,
                  name: "New Layout",
                  format: "extended",
                  bitLength: 29,
                  fields: [],
                };
              })
            }
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Layout
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {Object.values(profile.canIdLayouts).map((layout) => {
          const errors = validateCanIdLayout(layout.fields);
          const errorMap = mapBitErrors(errors);

          return (
            <div key={layout.id}>
              <Badge variant="default">
                CAN Frame: {layout.format.toUpperCase()} ({layout.bitLength}b)
              </Badge>
              {/* Layout name */}
              {mode !== "edit" ? (
                <div className="flex justify-between">
                  <div className="font-medium">{layout.name}</div>
                </div>
              ) : (
                <Input
                  value={layout.name}
                  onChange={(e) =>
                    updateDraftProfile((draft) => {
                      draft.canIdLayouts[layout.id].name = e.target.value;
                    })
                  }
                />
              )}

              <CanIdBitGridEditor
                bitLength={layout.bitLength}
                editable={mode === "edit"}
                fields={layout.fields}
                onChange={(id, start, length) =>
                  updateDraftProfile((draft) => {
                    const field = draft.canIdLayouts[layout.id].fields.find((x) => x.name === id);
                    if (!field) return;
                    field.startBit = start;
                    field.length = length;
                  })
                }
              />
              {/* Fields table */}
              {mode === "edit" && (
                <>
                  <div key={layout.id} className="border rounded-md p-3 space-y-2">
                    <table className="w-full text-xs border">
                      <thead>
                        <tr className="bg-muted">
                          <th>Name</th>
                          <th>Start</th>
                          <th>Len</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {layout.fields.map((f, idx) => (
                          <tr key={idx}>
                            <td>
                              <Input
                                value={f.name}
                                onChange={(e) =>
                                  updateDraftProfile((draft) => {
                                    draft.canIdLayouts[layout.id].fields[idx].name = e.target.value;
                                  })
                                }
                              />
                            </td>
                            <td>
                              <Input
                                type="number"
                                value={f.startBit}
                                onChange={(e) =>
                                  updateDraftProfile((draft) => {
                                    draft.canIdLayouts[layout.id].fields[idx].startBit = Number(e.target.value);
                                  })
                                }
                              />
                            </td>
                            <td>
                              <Input
                                type="number"
                                value={f.length}
                                onChange={(e) =>
                                  updateDraftProfile((draft) => {
                                    draft.canIdLayouts[layout.id].fields[idx].length = Number(e.target.value);
                                  })
                                }
                              />
                            </td>
                            <td>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  updateDraftProfile((draft) => {
                                    draft.canIdLayouts[layout.id].fields.splice(idx, 1);
                                  })
                                }
                              >
                                <Trash className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Error details */}

                    {errors.length > 0 && (
                      <div className="text-xs text-destructive space-y-1">
                        <Badge variant="destructive">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {errors.length} overlap
                          {errors.length > 1 ? "s" : ""}
                        </Badge>
                        {errors.map((e, i) => (
                          <div key={i}>
                            {e.fieldA} overlaps {e.fieldB} at bits {e.overlapRange[0]}–{e.overlapRange[1]}
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateDraftProfile((draft) => {
                          draft.canIdLayouts[layout.id].fields.push({
                            name: "newField",
                            startBit: 0,
                            length: 1,
                          });
                        })
                      }
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Field
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
