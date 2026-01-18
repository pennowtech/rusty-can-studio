import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useProfileStore } from "@/profile-editor/store/profileStore";
import { Badge } from "@/components/ui/badge";
import { CanIdLayoutsCard } from "@/profile-editor/CanIdLayoutsCard";

export function ProfileVisualView() {
  return (
    <div>
      <MetaView />
      <CanIdLayoutsCard />
      <FramesView />
      <DerivedFieldsView />
      <ColumnsView />
    </div>
  );
}

function MetaView() {
  const meta = useProfileStore((s) => s.profile!.meta);

  return (
    <Card>
      <CardHeader>
        <b>Profile:</b> {meta.name}
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {meta.version && (
          <div>
            <b>Version:</b> {meta.version}
          </div>
        )}
        {meta.description && <div>{meta.description}</div>}
      </CardContent>
    </Card>
  );
}

function FramesView() {
  const frames = useProfileStore((s) => s.profile!.frames);

  return (
    <Card>
      <CardHeader>
        <span className="font-semibold">Frames</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(frames).map(([name, frame]) => (
          <div key={name} className="border rounded-md p-3">
            <div className="font-medium">{name}</div>
            <div className="text-xs text-muted-foreground">CAN ID Layout: {frame.canIdLayout}</div>

            <div className="mt-2 flex flex-wrap gap-1">
              {frame.signals.map((s) => (
                <Badge key={s.name} variant="outline">
                  {s.name} [{s.startByte}:{s.startByte + s.length}]
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DerivedFieldsView() {
  const fields = useProfileStore((s) => s.profile!.derivedFields);

  return (
    <Card>
      <CardHeader>Derived Fields</CardHeader>
      <CardContent className="text-sm space-y-1">
        {fields.map((f) => (
          <div key={f.name} className="flex items-center gap-2">
            {f.name} <ArrowLeft className="h-3 w-3" /> {f.source === "signal" ? f.signal : f.expression}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ColumnsView() {
  const columns = useProfileStore((s) => s.profile!.columns);

  return (
    <Card>
      <CardHeader>Columns</CardHeader>
      <CardContent className="text-sm space-y-1">
        {columns.map((c, i) => (
          <div key={i}>
            {c.visible ? "👁" : "🚫"} {c.label} ({c.source})
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
