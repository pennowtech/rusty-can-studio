/**
 * MainView.tsx
 * ------------------------------------------------------------
 * Main content router for the application shell.
 *
 * RESPONSIBILITY
 * - Selects which high-level view is rendered:
 *   - CAN Monitor
 *   - CAN Simulator
 *   - Profile Editor
 *   - Settings
 * - Acts as a lightweight view switcher
 * - based on the current AppShell state
 *
 * CONVENTIONS
 * - MUST NOT contain routing libraries (v1)
 * - MUST NOT contain layout chrome
 * - SHOULD keep switch logic explicit and readable
 * - Views must preserve their internal state across switches
 * - Explicit switch-based routing (v1)
 * - No React Router dependency
 */

import { CanFdDashboard } from "@/app/CanFdDashboard";
import { CanSimulatorSequences } from "@/app/CanSimulatorSequences";
import { TerminalTraceView } from "@/app/TerminalTraceView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { commandRegistry } from "@/commands/registry";
import { displayShortcut, formatShortcutFromEvent, shortcutConflicts, useShortcutStore } from "@/commands/shortcutStore";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme, ThemeDensity, ThemePalette } from "@/components/ThemeProvider";
import { HelpShell } from "@/components/help-system/HelpShell";
import { localeOptions, useI18nStore } from "@/i18n/i18nStore";
import { openJsonFile, saveJsonFile } from "@/profile-editor/tauriFileIO";
import { useAppStore } from "@/store/appShellStore";
import { useConnectionStore } from "@/store/connectionStore";
import { DiagnosticLevel, useDiagnosticsStore } from "@/store/diagnosticsStore";
import { useTraceArchiveStore } from "@/store/traceArchiveStore";
import { parseCandump } from "@/can/candump";
import { ProfileMainShell } from "@/profile-editor/ProfileMainShell";
import { useState } from "react";
import { AlertTriangle, Info, Keyboard, Monitor, Palette, RotateCcw, Rows3, ShieldCheck } from "lucide-react";
// import { EditorShell } from "@/editor/EditorShell";

function SettingsView() {
  const traceFrameLimit = useConnectionStore((s) => s.traceFrameLimit);
  const frames = useConnectionStore((s) => s.frames);
  const loadTraceFrames = useConnectionStore((s) => s.loadTraceFrames);
  const setTraceFrameLimit = useConnectionStore((s) => s.setTraceFrameLimit);
  const traceArchive = useTraceArchiveStore((s) => s.entries);
  const addTraceArchiveEntry = useTraceArchiveStore((s) => s.addEntry);
  const deleteTraceArchiveEntry = useTraceArchiveStore((s) => s.deleteEntry);
  const clearTraceArchive = useTraceArchiveStore((s) => s.clear);
  const diagnostics = useDiagnosticsStore((s) => s.entries);
  const clearDiagnostics = useDiagnosticsStore((s) => s.clear);
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const formatDateTime = useI18nStore((s) => s.formatDateTime);
  const formatNumber = useI18nStore((s) => s.formatNumber);
  const t = useI18nStore((s) => s.t);
  const { theme, palette, density, setTheme, setPalette, setDensity } = useTheme();
  const [draftLimit, setDraftLimit] = useState(String(traceFrameLimit));

  function saveTraceLimit() {
    setTraceFrameLimit(Number(draftLimit));
  }

  const backupKeys = [
    "can-app-theme",
    "cansim.locale.v1",
    "can-connection-profiles",
    "cansim.trace.settings.v1",
    "cansim.traceArchive.v1",
    "cansim.monitor.preferences.v1",
    "cansim.monitor.filterPresets.v1",
    "cansim.monitor.alertRules.v1",
    "cansim.diagnostics.v1",
    "cansim.shortcuts.v1",
    "cansim.help.customMarkdown",
    "can-simulator-sequences:v1",
    "can-simulator-sequences:selected-sequence",
    "can-simulator-sequences:selected-step",
    "can-simulator-sequences:run-log",
    "can-simulator-sequences:run-state",
  ];

  async function exportSettingsBackup() {
    const settings = Object.fromEntries(backupKeys.map((key) => [key, localStorage.getItem(key)]).filter(([, value]) => value != null));
    await saveJsonFile(
      JSON.stringify(
        {
          meta: {
            app: "rusty-can-studio",
            version: "0.2.0",
            exportedAt: new Date().toISOString(),
          },
          settings,
        },
        null,
        2,
      ),
      "rusty-can-studio-settings.json",
    );
  }

  async function importSettingsBackup() {
    const text = await openJsonFile();
    if (!text) return;
    const parsed = JSON.parse(text) as { settings?: Record<string, string | null> };
    if (!parsed.settings || typeof parsed.settings !== "object") {
      window.alert("This file does not look like a Rusty CAN Studio settings backup.");
      return;
    }
    const shouldImport = window.confirm("Importing this backup will replace local settings and reload the app. Continue?");
    if (!shouldImport) return;
    for (const key of backupKeys) {
      const value = parsed.settings[key];
      if (typeof value === "string") localStorage.setItem(key, value);
      if (value === null) localStorage.removeItem(key);
    }
    window.location.reload();
  }

  const feedbackTemplate = `Summary:

What happened:

What I expected:

Steps to reproduce:
1.
2.
3.

App version: 0.2.0
`;

  function openFeedbackIssue() {
    const title = encodeURIComponent("Feedback: ");
    const body = encodeURIComponent(feedbackTemplate);
    window.open(`https://github.com/pennowtech/rusty-can-studio/issues/new?title=${title}&body=${body}`, "_blank", "noopener,noreferrer");
  }

  function copyFeedbackTemplate() {
    void navigator.clipboard?.writeText(feedbackTemplate);
  }

  async function exportDiagnostics() {
    await saveJsonFile(
      JSON.stringify(
        {
          meta: {
            app: "rusty-can-studio",
            exportedAt: new Date().toISOString(),
          },
          diagnostics,
        },
        null,
        2,
      ),
      "rusty-can-studio-diagnostics.json",
    );
  }

  function clearDiagnosticsWithConfirmation() {
    if (!window.confirm("Clear diagnostics log?")) return;
    clearDiagnostics();
  }

  function diagnosticLevelClass(level: DiagnosticLevel) {
    if (level === "error") return "text-destructive";
    if (level === "warning") return "text-amber-600 dark:text-amber-300";
    return "text-muted-foreground";
  }

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

  function formatCandumpLine(frame: (typeof frames)[number]) {
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

  function saveCurrentTraceToArchive() {
    if (!frames.length) return;
    const name = window.prompt("Trace name", `trace-${new Date().toISOString().replace(/[:.]/g, "-")}.candump.log`);
    if (!name?.trim()) return;
    addTraceArchiveEntry({
      name: name.trim(),
      frameCount: frames.length,
      candumpText: frames.map(formatCandumpLine).join("\n"),
    });
  }

  function loadArchivedTrace(id: string) {
    const entry = traceArchive.find((item) => item.id === id);
    if (!entry) return;
    loadTraceFrames(entry.name, parseCandump(entry.candumpText));
  }

  function exportArchivedTrace(id: string) {
    const entry = traceArchive.find((item) => item.id === id);
    if (!entry) return;
    downloadTextFile(entry.name.endsWith(".log") ? entry.name : `${entry.name}.candump.log`, entry.candumpText);
  }

  function deleteArchivedTrace(id: string) {
    const entry = traceArchive.find((item) => item.id === id);
    if (!entry) return;
    if (!window.confirm(`Delete archived trace "${entry.name}"?`)) return;
    deleteTraceArchiveEntry(id);
  }

  function clearArchivedTraces() {
    if (!window.confirm("Delete all archived traces?")) return;
    clearTraceArchive();
  }

  const densityDescription = {
    comfortable: "Touch-friendly spacing for general use.",
    compact: "Reduced spacing for more controls and rows.",
    dense: "Trace-first layout with maximum visible data.",
  }[density];

  const densityPreviewRows = {
    comfortable: "about 20-24 rows",
    compact: "about 34-40 rows",
    dense: "about 41-46 rows",
  }[density];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl space-y-4">
        <div>
          <h1 className="text-lg font-semibold">{t("settings.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">{t("settings.localization")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium">
                {t("settings.language")}
                <Select value={locale} onValueChange={(value) => setLocale(value as typeof locale)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {localeOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-[11px] uppercase text-muted-foreground">Number</div>
                <div className="mt-1 font-mono text-sm">{formatNumber(1234567.89)}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-[11px] uppercase text-muted-foreground">Date and time</div>
                <div className="mt-1 font-mono text-sm">{formatDateTime(Date.now())}</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{t("settings.localizationDescription")}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">{t("settings.appearance")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium">
                Mode
                <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-xs font-medium">
                Color theme
                <Select value={palette} onValueChange={(value) => setPalette(value as ThemePalette)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="graphite">Graphite</SelectItem>
                    <SelectItem value="zeiss-blue">Zeiss Blue</SelectItem>
                    <SelectItem value="high-contrast">High Contrast</SelectItem>
                    <SelectItem value="terminal">Terminal Trace</SelectItem>
                    <SelectItem value="warm-neutral">Warm Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-xs font-medium">
                Density
                <Select value={density} onValueChange={(value) => setDensity(value as ThemeDensity)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="dense">Dense</SelectItem>
                  </SelectContent>
                </Select>
                <span className="block text-[11px] font-normal text-muted-foreground">{densityDescription}</span>
              </label>
            </div>

            <div className="rounded-lg border bg-card p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Theme preview</div>
                  <div className="text-xs text-muted-foreground">Monitor states, decoded values, and controls use the selected palette immediately. Current density shows {densityPreviewRows} on a typical monitor.</div>
                </div>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">Connected</Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Line</th>
                        <th className="px-3 py-2">Dir</th>
                        <th className="px-3 py-2">CAN ID</th>
                        <th className="px-3 py-2">Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="px-3 py-2 font-mono">128</td>
                        <td className="px-3 py-2"><Badge variant="secondary">RX</Badge></td>
                        <td className="px-3 py-2 font-mono">18203C01</td>
                        <td className="px-3 py-2 font-mono">message_good=good</td>
                      </tr>
                      <tr className="border-t bg-sky-500/10">
                        <td className="px-3 py-2 font-mono">129</td>
                        <td className="px-3 py-2"><Badge>TX:sent</Badge></td>
                        <td className="px-3 py-2 font-mono">14089C01</td>
                        <td className="px-3 py-2 font-mono">01 01 07 00 00 00</td>
                      </tr>
                      <tr className="border-t bg-destructive/10 text-destructive">
                        <td className="px-3 py-2 font-mono">130</td>
                        <td className="px-3 py-2"><Badge variant="destructive">TX:failed</Badge></td>
                        <td className="px-3 py-2 font-mono">0C08FC01</td>
                        <td className="px-3 py-2 font-mono">Daemon rejected frame</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Decoded preview</div>
                  <div className="rounded border bg-background p-2">
                    <div className="text-xs text-muted-foreground">command_class</div>
                    <div className="text-sm font-medium">command/request (6)</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1">Apply</Button>
                    <Button size="sm" variant="outline" className="flex-1">Cancel</Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">CAN Monitor trace retention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Keep the newest rows in the trace table and discard older rows automatically. Latest live frames stay at the bottom.
            </p>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="space-y-1 text-xs font-medium">
                Maximum rows
                <Input
                  type="number"
                  min={50}
                  max={50000}
                  step={50}
                  value={draftLimit}
                  onChange={(event) => setDraftLimit(event.target.value)}
                />
              </label>
              <div className="flex items-end">
                <Button onClick={saveTraceLimit}>Save</Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Current trace: {frames.length} rows. Saved limit: {traceFrameLimit} rows.
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm">Historical traces</CardTitle>
              <Badge variant="outline">{formatNumber(traceArchive.length)} saved</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Save the current retained trace as candump text for later inspection. Archived traces can be loaded back into CAN Monitor, exported, or deleted.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!frames.length} onClick={saveCurrentTraceToArchive}>Save current trace</Button>
              <Button variant="outline" disabled={!traceArchive.length} onClick={clearArchivedTraces}>Clear archive</Button>
            </div>
            <div className="max-h-72 overflow-auto rounded-md border bg-muted/20">
              {traceArchive.length ? (
                traceArchive.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-3 last:border-0">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{entry.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatNumber(entry.frameCount)} frames, saved {formatDateTime(entry.createdAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" onClick={() => loadArchivedTrace(entry.id)}>Load</Button>
                      <Button variant="ghost" size="sm" onClick={() => exportArchivedTrace(entry.id)}>Export</Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteArchivedTrace(entry.id)}>Delete</Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm text-muted-foreground">No archived traces yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
              <CardTitle className="text-sm">{t("settings.backup")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export local app settings to a JSON file, or restore them on another installation. This includes appearance, shortcuts,
              monitor preferences, connection profiles, trace retention, custom help text, and CAN Simulator sequences.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void exportSettingsBackup()}>Export settings</Button>
              <Button variant="outline" onClick={() => void importSettingsBackup()}>Import settings</Button>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm">{t("settings.diagnostics")}</CardTitle>
              <Badge variant="outline">{formatNumber(diagnostics.length)} entries</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connection attempts, daemon errors, transmit failures, and profile import or validation errors are recorded here for troubleshooting.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!diagnostics.length} onClick={() => void exportDiagnostics()}>Export diagnostics</Button>
              <Button variant="outline" disabled={!diagnostics.length} onClick={clearDiagnosticsWithConfirmation}>Clear diagnostics</Button>
            </div>
            <div className="max-h-72 overflow-auto rounded-md border bg-muted/20">
              {diagnostics.length ? (
                diagnostics.slice().reverse().map((entry) => (
                  <div key={entry.id} className="border-b p-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">{formatDateTime(entry.time)}</span>
                      <span className={`font-semibold uppercase ${diagnosticLevelClass(entry.level)}`}>{entry.level}</span>
                      <span className="rounded border bg-background px-1.5 py-0.5 font-medium">{entry.source}</span>
                    </div>
                    <div className="mt-1 text-sm">{entry.message}</div>
                    {entry.detail && <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">{entry.detail}</pre>}
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm text-muted-foreground">No diagnostics recorded yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">Feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use this when something feels confusing, slow, broken, or missing. The issue template includes the basic details that make feedback easier to act on.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={openFeedbackIssue}>Open feedback issue</Button>
              <Button variant="outline" onClick={copyFeedbackTemplate}>Copy template</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AboutView() {
  const setView = useAppStore((s) => s.setView);
  const { palette, density } = useTheme();

  return (
    <div className="h-full overflow-auto bg-muted/20 p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="p-8">
              <Badge variant="outline" className="mb-4">Version 0.2.0</Badge>
              <h1 className="text-3xl font-semibold tracking-tight">Rusty CAN Studio</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                A desktop workbench for CAN-FD capture, profile-driven decoding, loaded trace inspection, display filtering, and transmit preparation.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button onClick={() => setView("monitor")}>Open Monitor</Button>
                <Button variant="outline" onClick={() => setView("help")}>Open Help</Button>
              </div>
            </div>
            <div className="border-t bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.18),transparent_32%),linear-gradient(135deg,hsl(var(--muted)),hsl(var(--background)))] p-6 lg:border-l lg:border-t-0">
              <div className="grid gap-3">
                {[
                  ["Active palette", palette],
                  ["Density", density],
                  ["Profile format", "JSON schema profiles"],
                  ["Trace source", "Live capture or loaded log"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-background/80 p-3">
                    <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
                    <div className="mt-1 text-sm font-medium">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Monitor, title: "Monitor", text: "Sticky trace headers, display filters, decoded preview, context copy, and transmit staging." },
            { icon: Rows3, title: "Profiles", text: "Visual editing for service, payload header, attributes, operations, and payload fields." },
            { icon: Palette, title: "Themes", text: "Selectable color palettes and density modes for comfortable, compact, or dense workflows." },
            { icon: ShieldCheck, title: "Help", text: "Searchable documentation, callouts, shortcuts, and workflow notes are available from Help." },
          ].map((item) => (
            <Card key={item.title} className="rounded-xl">
              <CardHeader className="pb-2">
                <item.icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-sm">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.text}</CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortcutsView() {
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const setShortcut = useShortcutStore((s) => s.setShortcut);
  const resetShortcut = useShortcutStore((s) => s.resetShortcut);
  const resetAllShortcuts = useShortcutStore((s) => s.resetAllShortcuts);
  const conflicts = shortcutConflicts(shortcuts);
  const groupedCommands = commandRegistry.reduce<Record<string, typeof commandRegistry>>((groups, command) => {
    const category = command.category ?? "Commands";
    groups[category] ??= [];
    groups[category].push(command);
    return groups;
  }, {});

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Keyboard shortcuts</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Click a shortcut field and press the new key combination. Changes are saved immediately.</p>
          </div>
          <Button variant="outline" onClick={resetAllShortcuts}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset all
          </Button>
        </div>

        {conflicts.size > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>Some shortcuts are assigned to more than one command. Resolve highlighted rows before relying on those shortcuts.</div>
          </div>
        )}

        <div className="grid gap-4">
          {Object.entries(groupedCommands).map(([category, commands]) => (
            <Card key={category} className="rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{category}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {commands.map((command) => {
                  const hasConflict = conflicts.has(command.id);
                  return (
                    <div key={command.id} className={`grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_220px_auto] ${hasConflict ? "border-amber-500/60 bg-amber-500/10" : "bg-muted/20"}`}>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{command.title}</div>
                        {command.description && <div className="mt-0.5 text-xs text-muted-foreground">{command.description}</div>}
                      </div>
                      <Input
                        readOnly
                        value={displayShortcut(shortcuts, command.id)}
                        placeholder="No shortcut"
                        className="font-mono text-xs"
                        onKeyDown={(event) => {
                          event.preventDefault();
                          const nextShortcut = formatShortcutFromEvent(event.nativeEvent);
                          if (nextShortcut) setShortcut(command.id, nextShortcut);
                        }}
                      />
                      <Button variant="ghost" size="sm" onClick={() => resetShortcut(command.id)}>
                        Reset
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>Shortcuts are stored locally for this desktop app installation. The command panel shows the same saved shortcuts.</div>
        </div>
      </div>
    </div>
  );
}

export function MainView() {
  const view = useAppStore((s) => s.view);

  switch (view) {
    case "profile-editor":
      return (
        <div className="h-full overflow-hidden p-4">
          <ProfileMainShell />
        </div>
      );

    case "monitor":
      return <CanFdDashboard />;

    case "terminal":
      return <TerminalTraceView />;

    case "simulator":
      return <CanSimulatorSequences />;

    case "settings":
      return <SettingsView />;

    case "help":
      return <HelpShell />;

    case "shortcuts":
      return <ShortcutsView />;

    case "about":
      return <AboutView />;

    default:
      return null;
  }
}
