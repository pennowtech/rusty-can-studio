import { useEditorStore } from "@/store/editorStore";
import { SignalEditor } from "./SignalEditor";
import { DerivedFieldEditor } from "./DerivedFieldEditor";
import { CanIdLayoutEditor } from "@/editor/can-id/CanIdLayoutEditor";
import { CanIdFieldEditor } from "@/editor/can-id/CanIdFieldEditor";
// import { ColumnBuilder } from "./ColumnBuilder";

export function EditorPanel() {
  const selection = useEditorStore((s) => s.selection);

  console.log("EditorPanel signal:", JSON.stringify(selection, null, 2));

  if (selection.type === "canIdLayout") {
    return <CanIdLayoutEditor layoutId={selection.layoutId} />;
  }

  if (selection.type === "canIdField") {
    return <CanIdFieldEditor layoutId={selection.layoutId} fieldId={selection.fieldId} />;
  }

  if (selection.type === "signal") {
    return <SignalEditor {...selection} />;
  }

  if (selection.type === "derived") {
    return <DerivedFieldEditor derivedId={selection.derivedId} />;
  }

  if (selection.type === "columns") {
    // return <ColumnBuilder />;
    return <div className="flex-1 p-4 text-muted-foreground">Column editor2</div>;
  }

  return <div className="flex-1 p-4 text-muted-foreground">Select an item to edit</div>;
}
