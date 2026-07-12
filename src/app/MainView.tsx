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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme, ThemeDensity, ThemePalette } from "@/components/ThemeProvider";
import { HelpShell } from "@/components/help-system/HelpShell";
import { useAppStore } from "@/store/appShellStore";
import { useConnectionStore } from "@/store/connectionStore";
import { ProfileMainShell } from "@/profile-editor/ProfileMainShell";
import { useState } from "react";
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
      return <CanFdDashboard />;

    case "settings":
      return <SettingsView />;

    case "help":
      return <HelpShell />;

    default:
      return null;
  }
}
