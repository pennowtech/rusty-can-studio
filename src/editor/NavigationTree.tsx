import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/editorStore";
import { Plus, Trash2 } from "lucide-react";

export function NavigationTree() {
  const { profile, select, addDerivedField, deleteDerivedField, selection } = useEditorStore();
  const canIdLayouts = profile.canIdLayouts ?? {};
  console.log("NavigationTree profile canIdLayouts:", canIdLayouts);

  return (
    <div className="w-64 border-r p-2">
      <h3 className="font-semibold mb-2">{profile.meta.name}</h3>

      {/* CAN ID */}
      <div>
        <div className="text-xs uppercase text-muted-foreground mb-1">CAN ID</div>

        {Object.values(canIdLayouts).map((layout) => (
          <div key={layout.id}>
            <button
              className="font-medium text-left w-full"
              onClick={() => select({ type: "canIdLayout", layoutId: layout.id })}
            >
              {layout.name}
            </button>

            {Object.values(layout.fields).map((field) => (
              <button
                key={field.id}
                className="ml-4 text-sm text-left w-full"
                onClick={() =>
                  select({
                    type: "canIdField",
                    layoutId: layout.id,
                    fieldId: field.id,
                  })
                }
              >
                {field.name}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="text-sm space-y-1">
        {Object.values(profile.frames).map((frame) => (
          <div key={frame.id}>
            <div className="font-medium">{frame.id}</div>
            {Object.values(frame.signals).map((sig) => (
              <button
                key={sig.id}
                className="ml-4"
                onClick={() =>
                  select({
                    type: "signal",
                    frameId: frame.id,
                    signalId: sig.id,
                  })
                }
              >
                {sig.name}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Derived Fields */}
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">Derived Fields</div>

        {Object.values(profile.derivedFields).length === 0 && (
          <div className="ml-2 text-xs text-muted-foreground">(none)</div>
        )}

        {Object.values(profile.derivedFields).map((df) => (
          <button
            key={df.id}
            className="ml-2 text-sm text-left hover:underline"
            onClick={() => select({ type: "derived", derivedId: df.id })}
          >
            {df.name}
          </button>
        ))}
      </div>

      {/* DERIVED FIELDS */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">Derived Fields</div>

          <Button variant="ghost" size="icon" onClick={addDerivedField} title="Add Derived Field">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {Object.values(profile.derivedFields).length === 0 && (
          <div className="ml-2 text-xs text-muted-foreground">(none)</div>
        )}

        {Object.values(profile.derivedFields).map((df) => {
          const selected = selection.type === "derived" && selection.derivedId === df.id;

          return (
            <div
              key={df.id}
              className={`group flex items-center justify-between rounded px-2 py-1 text-sm ${
                selected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              }`}
            >
              <button
                className="flex-1 text-left"
                onClick={() =>
                  select({
                    type: "derived",
                    derivedId: df.id,
                  })
                }
              >
                {df.name}
              </button>

              {/* Delete button (appears on hover) */}
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => {
                  if (confirm(`Delete derived field "${df.name}"?`)) {
                    deleteDerivedField(df.id);
                  }
                }}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Columns */}
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">Columns</div>

        <button className="ml-2 text-sm hover:underline" onClick={() => select({ type: "columns" })}>
          Edit Columns
        </button>
      </div>
    </div>
  );
}
