/**
 * types.ts
 * ------------------------------------------------------------
 *  Define types for application commands
 *
 * RESPONSIBILITY
 * - CommandContext provides methods to manipulate app state
 * - AppCommand defines the structure of a command
 * - Commands can be run with access to the CommandContext
 *
 * CONVENTIONS
 * - Commands should be self-contained
 * - CommandContext should expose only necessary methods
 * - Commands should not directly manipulate UI components
 */

import { Theme } from "@/components/ThemeProvider";

export type CommandContext = {
  setView: (view: any) => void;
  setTheme: (theme: Theme) => void;
  openConnectDialog: () => void;
  openConnectionManager: () => void;
};

export type AppCommand = {
  id: string;
  title: string;
  category?: string;
  keywords?: string[];
  shortcut?: string;
  handler: (ctx: CommandContext) => void;
};
