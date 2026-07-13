import { Badge } from "@/components/ui/badge";
import type { DecodedField, DecodedFrame } from "@/profile-editor/decodeProfile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  decodedPreviewColumnLabels,
  DecodedPreviewColumnId,
  useMonitorPreferencesStore,
} from "@/store/monitorPreferencesStore";
import { Columns3 } from "lucide-react";

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(3);
}

function formatDisplay(field: DecodedField) {
  return field.meaning ? `${field.displayValue} (${formatNumber(field.physical)})` : field.displayValue;
}

function bitRange(field: DecodedField) {
  const endBit = field.startBit + field.length - 1;
  return field.length === 1 ? `bit ${field.startBit}` : `bits ${field.startBit}-${endBit}`;
}

const decodedPreviewColumnOrder: DecodedPreviewColumnId[] = ["field", "bits", "raw", "value", "meaning"];

export function DecodedPreviewColumnMenu() {
  const columns = useMonitorPreferencesStore((s) => s.decodedPreviewColumns);
  const toggleColumn = useMonitorPreferencesStore((s) => s.toggleDecodedPreviewColumn);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <Columns3 className="h-3.5 w-3.5" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Decoded columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {decodedPreviewColumnOrder.map((column) => (
          <DropdownMenuCheckboxItem
            key={column}
            checked={columns[column]}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => toggleColumn(column)}
          >
            {decodedPreviewColumnLabels[column]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function fieldInfo(field: DecodedField) {
  return `${field.name}\nSource: ${field.source}\nBits: ${bitRange(field)}\nRaw: ${field.raw}\nValue: ${field.displayValue}${
    field.meaning ? `\nMeaning: ${field.meaning}` : ""
  }`;
}

function FieldGroup({
  title,
  fields,
  onOpenField,
}: {
  title: string;
  fields: DecodedField[];
  onOpenField?: (field: DecodedField) => void;
}) {
  const columns = useMonitorPreferencesStore((s) => s.decodedPreviewColumns);
  const visibleColumnCount = decodedPreviewColumnOrder.filter((column) => columns[column]).length;

  return (
    <section className="overflow-hidden rounded-md border bg-background">
      <div className="flex items-center justify-between">
        <h3 className="decoded-preview-small px-2.5 py-1.5 font-semibold uppercase text-muted-foreground">{title}</h3>
        <Badge className="decoded-preview-small mr-2 h-5 px-1.5" variant="outline">{fields.length}</Badge>
      </div>
      {fields.length ? (
        <div className="overflow-auto border-t">
          <table className="w-full table-auto">
            <thead className="decoded-preview-small bg-muted/50 uppercase text-muted-foreground">
              <tr>
                {columns.field && <th className="px-2 py-1 text-left font-medium">Field</th>}
                {columns.bits && <th className="px-2 py-1 text-left font-medium">Bits</th>}
                {columns.raw && <th className="px-2 py-1 text-right font-medium">Raw</th>}
                {columns.value && <th className="px-2 py-1 text-right font-medium">Value</th>}
                {columns.meaning && <th className="px-2 py-1 text-left font-medium">Meaning</th>}
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr
                  key={`${field.source}-${field.name}-${field.startBit}`}
                  className="border-t last:border-b-0 hover:bg-muted/30"
                  title={fieldInfo(field)}
                  onDoubleClick={() => onOpenField?.(field)}
                >
                  {columns.field && (
                    <td className="max-w-32 truncate font-medium" title={field.name}>
                      {field.name}
                    </td>
                  )}
                  {columns.bits && <td className="decoded-preview-small whitespace-nowrap font-mono text-muted-foreground">{bitRange(field)}</td>}
                  {columns.raw && <td className="text-right font-mono">{field.raw}</td>}
                  {columns.value && (
                    <td className="text-right font-mono">
                      {formatDisplay(field)}
                    </td>
                  )}
                  {columns.meaning && (
                    <td className="max-w-36 truncate text-muted-foreground" title={field.meaning}>
                      {field.meaning ?? ""}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="decoded-preview-small border-t px-2.5 py-2 text-muted-foreground" style={{ gridColumn: `span ${visibleColumnCount}` }}>
          No {title.toLowerCase()} defined.
        </div>
      )}
    </section>
  );
}

export function DecodedPreviewPanel({
  decoded,
  emptyText,
  onOpenMessage,
  onOpenField,
}: {
  decoded: DecodedFrame | null;
  emptyText?: string;
  onOpenMessage?: (decoded: DecodedFrame) => void;
  onOpenField?: (field: DecodedField, decoded: DecodedFrame) => void;
}) {
  if (!decoded) {
    return <div className="text-sm text-muted-foreground">{emptyText ?? "No frame selected for decode."}</div>;
  }

  return (
    <div className="decoded-preview-panel space-y-2.5">
      {!decoded.requiresSchema && (
      <div className="rounded-md border bg-background">
        <div
          className="cursor-pointer border-l-4 border-primary px-2.5 py-2"
          title={`${decoded.meaning}\n${decoded.serviceName ?? decoded.frameName ?? "Unknown message"}`}
          onDoubleClick={() => onOpenMessage?.(decoded)}
        >
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">{decoded.meaning}</div>
            <div className="decoded-preview-small mt-0.5 truncate text-muted-foreground">
              {decoded.serviceName ?? decoded.frameName ?? "Unknown message"}
            </div>
          </div>
        </div>
      </div>
      )}

      <FieldGroup title="CAN ID fields" fields={decoded.canIdFields} onOpenField={(field) => onOpenField?.(field, decoded)} />
      <FieldGroup title="Payload fields" fields={decoded.payloadFields} onOpenField={(field) => onOpenField?.(field, decoded)} />

      {decoded.errorCode != null && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs">
          Error {decoded.errorCode}: {decoded.errorText ?? "Unknown error code"}
        </div>
      )}
    </div>
  );
}

