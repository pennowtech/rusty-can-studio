import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { commandRegistry } from "@/commands/registry";
import { displayShortcut, useShortcutStore } from "@/commands/shortcutStore";
import { useCommandPaletteStore } from "@/store/commandPaletteStore";
import { useAppStore } from "@/store/appShellStore";
import { useTheme } from "@/components/ThemeProvider";
import { useConnectDialogStore } from "@/store/canConnectDialogStore";
import { useUiStore } from "@/store/uiStore";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export function CommandPalette() {
  const { open, openPalette, closePalette } = useCommandPaletteStore();
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const setView = useAppStore((s) => s.setView);
  const { setTheme } = useTheme();
  const openConnectDialog = useConnectDialogStore((s) => s.openDialog);
  const openConnectionManager = useUiStore((s) => s.openConnectionManager);
  const groupedCommands = commandRegistry.reduce<Record<string, typeof commandRegistry>>((groups, command) => {
    const category = command.category ?? "Commands";
    groups[category] ??= [];
    groups[category].push(command);
    return groups;
  }, {});

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? openPalette() : closePalette())}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        <VisuallyHidden>
          <DialogTitle>Command Panel</DialogTitle>
          <DialogDescription>Search and run application commands.</DialogDescription>
        </VisuallyHidden>
        <Command className="bg-background">
          <div className="border-b bg-muted/30 px-4 py-3 pr-12">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Command Panel</div>
                <div className="text-xs text-muted-foreground">Run actions, switch views, and open help surfaces.</div>
              </div>
            </div>
          </div>
          <CommandInput placeholder="Search commands, views, help, or connection actions" />
          <CommandList className="max-h-[440px] p-2">
            <CommandEmpty>No matching command.</CommandEmpty>
            {Object.entries(groupedCommands).map(([category, commands]) => (
              <CommandGroup key={category} heading={category}>
                {commands.map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    value={[cmd.title, cmd.description, ...(cmd.keywords ?? [])].filter(Boolean).join(" ")}
                    className="items-start gap-3 rounded-md px-3 py-2"
                    onSelect={() => {
                      cmd.handler({ setView, setTheme, openConnectDialog, openConnectionManager, openPalette });
                      closePalette();
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{cmd.title}</div>
                      {cmd.description && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{cmd.description}</div>}
                    </div>
                    <CommandShortcut>{displayShortcut(shortcuts, cmd.id)}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            <span>Use arrow keys and Enter to run a command.</span>
            <button type="button"
              className="rounded px-2 py-1 hover:bg-muted hover:text-foreground"
              onClick={() => {
                setView("shortcuts");
                closePalette();
              }}
            >
              Edit shortcuts
            </button>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

