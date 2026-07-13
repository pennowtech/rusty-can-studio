import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConnectionStore } from "@/store/connectionStore";
import { Copy, Download, Terminal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function formatCanId(id: number) {
  return id.toString(16).toUpperCase().padStart(id > 0x7ff ? 8 : 3, "0");
}

function byteLength(dataHex: string) {
  return Math.floor(dataHex.replace(/[^0-9a-fA-F]/g, "").length / 2);
}

function formatPayloadBytes(dataHex: string) {
  const cleaned = dataHex.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return cleaned.match(/.{1,2}/g)?.join(" ") ?? "";
}

function formatCandumpLine(frame: ReturnType<typeof useConnectionStore.getState>["frames"][number]) {
  return `(${(frame.ts_ms / 1000).toFixed(6)}) ${frame.iface} ${formatCanId(frame.id)} [${byteLength(frame.data_hex).toString().padStart(2, "0")}] ${formatPayloadBytes(frame.data_hex)}`.trim();
}

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function TerminalTraceView() {
  const frames = useConnectionStore((s) => s.frames);
  const status = useConnectionStore((s) => s.status);
  const traceSourceName = useConnectionStore((s) => s.traceSourceName);
  const clearFrames = useConnectionStore((s) => s.clearFrames);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [maxLines, setMaxLines] = useState("1000");

  const visibleFrames = useMemo(() => {
    const limit = Number(maxLines);
    if (!Number.isFinite(limit) || limit <= 0 || frames.length <= limit) return frames;
    return frames.slice(frames.length - limit);
  }, [frames, maxLines]);

  const terminalText = useMemo(() => visibleFrames.map(formatCandumpLine).join("\n"), [visibleFrames]);

  useEffect(() => {
    if (!follow) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [follow, terminalText]);

  const connected = status === "connected";
  const sourceLabel = traceSourceName ? `Loaded: ${traceSourceName}` : connected ? "Live capture" : "No active capture";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background p-3">
      <Card className="flex min-h-0 flex-1 flex-col rounded-lg border-border/70 shadow-sm">
        <CardHeader className="flex-row items-center justify-between gap-3 border-b bg-muted/20 p-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Terminal className="h-4 w-4" />
              Terminal Trace
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={connected ? "default" : "outline"}>{connected ? "Connected" : status}</Badge>
              <span className="truncate">{sourceLabel}</span>
              <span>{frames.length} total frames</span>
              {visibleFrames.length !== frames.length && <span>showing newest {visibleFrames.length}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-xs">
              Lines
              <Select value={maxLines} onValueChange={setMaxLines}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="250">250</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1000</SelectItem>
                  <SelectItem value="5000">5000</SelectItem>
                  <SelectItem value="0">All</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <Label className="flex items-center gap-2 text-xs">
              <Checkbox checked={follow} onCheckedChange={(value) => setFollow(Boolean(value))} />
              Follow
            </Label>
            <Label className="flex items-center gap-2 text-xs">
              <Checkbox checked={wrap} onCheckedChange={(value) => setWrap(Boolean(value))} />
              Wrap
            </Label>
            <Button variant="outline" size="sm" className="h-8 px-2 text-xs" disabled={!terminalText} onClick={() => void navigator.clipboard?.writeText(terminalText)}>
              <Copy className="h-4 w-4" />
              Copy
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-2 text-xs" disabled={!terminalText} onClick={() => downloadTextFile(traceSourceName ?? "terminal-trace.candump.log", terminalText)}>
              <Download className="h-4 w-4" />
              Save
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={!frames.length} onClick={clearFrames}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <div ref={scrollRef} className="h-full overflow-auto bg-zinc-950 p-3 text-[12px] leading-5 text-zinc-100">
            {terminalText ? (
              <pre className={`font-mono ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>{terminalText}</pre>
            ) : (
              <div className="font-mono text-zinc-400">Connect to a daemon or open a candump file to stream terminal trace lines.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
