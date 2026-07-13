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
import { openJsonFile, saveJsonFile } from "@/profile-editor/tauriFileIO";
import { useAppStore } from "@/store/appShellStore";
import { useConnectionStore } from "@/store/connectionStore";
import { ProfileMainShell } from "@/profile-editor/ProfileMainShell";
import { useState } from "react";
import { AlertTriangle, Info, Keyboard, Monitor, Palette, RotateCcw, Rows3, ShieldCheck } from "lucide-react";
// import { EditorShell } from "@/editor/EditorShell";

function SettingsView() {
  const traceFrameLimit = useConnectionStore((s) => s.traceFrameLimit);
  const frames = useConnectionStore((s) => s.frames);
  const setTraceFrameLimit = useConnectionStore((s) => s.setTraceFrameLimit);
  const { theme, palette, density, setTheme, setPalette, setDensity } = useTheme();
  const [draftLimit, setDraftLimit] = useState(String(traceFrameLimit));

  function saveTraceLimit() {
    setTraceFrameLimit(Number(draftLimit));
  }

  const backupKeys = [
    "can-app-theme",
    "can-connection-profiles",
    "cansim.trace.settings.v1",
    "cansim.monitor.preferences.v1",
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
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure appearance, monitor retention, and CAN-FD defaults.</p>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">Appearance</CardTitle>
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
            <CardTitle className="text-sm">Backup and restore</CardTitle>
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
