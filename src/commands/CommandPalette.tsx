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
import { Dialog, DialogContent } from "@/components/ui/dialog";

import { commandRegistry } from "@/commands/registry";
import { useCommandPaletteStore } from "@/store/commandPaletteStore";
import { useAppStore } from "@/store/appShellStore";

export function CommandPalette() {
  const { open, closePalette } = useCommandPaletteStore();
  const setView = useAppStore((s) => s.setView);

  return (
    <Dialog open={open} onOpenChange={closePalette}>
      <DialogContent className="p-0">
        <Command>
          <CommandInput placeholder="Type a command…" />
          <CommandEmpty>No commands found.</CommandEmpty>

          <CommandGroup heading="Commands">
            {commandRegistry.map((cmd) => (
              <CommandItem
                key={cmd.id}
                value={[cmd.title, ...(cmd.keywords ?? [])].join(" ")}
                onSelect={() => {
                  cmd.handler({ setView });
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
