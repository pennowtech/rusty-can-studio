/**
 * CommandPalette.tsx
 * ------------------------------------------------------------
 * Global command palette component.
 *
 * RESPONSIBILITY
 * - Provides a searchable command interface
 * - Allows quick access to application commands
 * - Integrates with global state to execute commands
 *
 * CONVENTIONS
 * - Uses Zustand for state management
 * - Uses Dialog and Command components for UI
 * - Commands are registered in commandRegistry
 *
 * HOW TO USE
 * - Import and include <CommandPalette /> in the application root
 * - Use useCommandPaletteStore to control visibility
 * - Define commands in commandRegistry(registry.ts) with appropriate handlers
 * ------------------------------------------------------------
 */

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { commandRegistry } from "@/commands/registry";
import { useCommandPaletteStore } from "@/store/commandPaletteStore";
import { useAppStore } from "@/store/appShellStore";
import { useTheme } from "@/components/ThemeProvider";
import { useConnectDialogStore } from "@/store/canConnectDialogStore";
import { useUiStore } from "@/store/uiStore";

export function CommandPalette() {
  const { open, closePalette } = useCommandPaletteStore();
  const setView = useAppStore((s) => s.setView);
  const { setTheme } = useTheme();
  const openConnectDialog = useConnectDialogStore((s) => s.openDialog);
  const openConnectionManager = useUiStore((s) => s.openConnectionManager);

  return (
    <Dialog open={open} onOpenChange={closePalette}>
      <DialogContent className="p-0">
        {/* ✅ ACCESSIBILITY FIX */}
        <VisuallyHidden>
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription>Search and run application commands</DialogDescription>
        </VisuallyHidden>{" "}
        <Command>
          <CommandInput placeholder="Type a command…" />
          <CommandEmpty>No commands found.</CommandEmpty>

          <CommandGroup heading="Commands">
            {commandRegistry.map((cmd) => (
              <CommandItem
                key={cmd.id}
                value={[cmd.title, ...(cmd.keywords ?? [])].join(" ")}
                onSelect={() => {
                  cmd.handler({ setView, setTheme, openConnectDialog, openConnectionManager });
                  closePalette();
                }}
              >
                {cmd.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
