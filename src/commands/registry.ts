/**
 * registry.ts
 * ------------------------------------------------------------
 * Command registry for the application.
 *
 * RESPONSIBILITY
 * - Defines available commands for the command palette.
 * - Each command includes metadata and a handler function.
 * - Commands interact with the application state via CommandContext.
 *
 * CONVENTIONS
 * - Commands should be self-contained.
 * - CommandContext should expose only necessary methods.
 * - Commands should not directly manipulate UI components.
 */

import { AppCommand } from "./types";

export const commandRegistry: AppCommand[] = [
  {
    id: "can.connect",
    title: "CAN: Connect",
    category: "CAN",
    keywords: ["connect", "socketcan", "daemon"],
    handler: ({ openConnectDialog }) => openConnectDialog(),
  },
  {
    id: "can.manageConnections",
    title: "CAN: Manage Connections",
    category: "CAN",
    keywords: ["connect", "bridge", "daemon"],
    handler: ({ openConnectionManager }) => openConnectionManager(),
  },
  {
    id: "view.monitor",
    title: "View: CAN Monitor",
    category: "View",
    keywords: ["monitor", "can", "rx"],
    handler: ({ setView }) => setView("monitor"),
  },
  {
    id: "view.simulator",
    title: "View: CAN Simulator",
    category: "View",
    keywords: ["tx", "sim"],
    handler: ({ setView }) => setView("simulator"),
  },
  {
    id: "view.profileEditor",
    title: "View: Profile Editor",
    category: "View",
    keywords: ["profile", "editor"],
    handler: ({ setView }) => setView("profile-editor"),
  },
  {
    id: "theme.light",
    title: "Theme: Light",
    category: "Theme",
    keywords: ["light", "appearance"],
    handler: ({ setTheme }) => setTheme("light"),
  },
  {
    id: "theme.dark",
    title: "Theme: Dark",
    category: "Theme",
    keywords: ["dark", "appearance"],
    handler: ({ setTheme }) => setTheme("dark"),
  },
  {
    id: "theme.system",
    title: "Theme: System",
    category: "Theme",
    keywords: ["system", "appearance"],
    handler: ({ setTheme }) => setTheme("system"),
  },
  {
    id: "help.user.documentation",
    title: "Help: User Documentation",
    category: "Help",
    keywords: ["help", "documentation", "support"],
    handler: ({ setView }) => setView("help"),
  },
];
