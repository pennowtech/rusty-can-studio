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
    description: "Open the connection dialog for local or remote capture.",
    category: "CAN",
    keywords: ["connect", "socketcan", "daemon"],
    handler: ({ openConnectDialog }) => openConnectDialog(),
  },
  {
    id: "can.manageConnections",
    title: "CAN: Manage Connections",
    description: "Review saved local and remote connection entries.",
    category: "CAN",
    keywords: ["connect", "bridge", "daemon"],
    handler: ({ openConnectionManager }) => openConnectionManager(),
  },
  {
    id: "view.monitor",
    title: "View: CAN Monitor",
    description: "Inspect live captures, loaded logs, filters, decoded preview, and transmit composer.",
    category: "View",
    keywords: ["monitor", "can", "rx"],
    handler: ({ setView }) => setView("monitor"),
  },
  {
    id: "view.simulator",
    title: "View: CAN Simulator",
    description: "Open the transmit and simulation workspace.",
    category: "View",
    keywords: ["tx", "sim"],
    handler: ({ setView }) => setView("simulator"),
  },
  {
    id: "view.terminalTrace",
    title: "View: Terminal Trace",
    description: "Show live or loaded CAN frames as candump-style terminal lines.",
    category: "View",
    keywords: ["terminal", "trace", "candump", "log"],
    handler: ({ setView }) => setView("terminal"),
  },
  {
    id: "view.profileEditor",
    title: "View: Profile Editor",
    description: "Edit message profile JSON through the visual profile editor.",
    category: "View",
    keywords: ["profile", "editor"],
    handler: ({ setView }) => setView("profile-editor"),
  },
  {
    id: "view.settings",
    title: "View: Settings",
    description: "Configure appearance, density, and trace retention.",
    category: "View",
    keywords: ["settings", "appearance", "density"],
    handler: ({ setView }) => setView("settings"),
  },
  {
    id: "theme.light",
    title: "Theme: Light",
    description: "Use light appearance.",
    category: "Theme",
    keywords: ["light", "appearance"],
    handler: ({ setTheme }) => setTheme("light"),
  },
  {
    id: "theme.dark",
    title: "Theme: Dark",
    description: "Use dark appearance.",
    category: "Theme",
    keywords: ["dark", "appearance"],
    handler: ({ setTheme }) => setTheme("dark"),
  },
  {
    id: "theme.system",
    title: "Theme: System",
    description: "Follow the operating system appearance.",
    category: "Theme",
    keywords: ["system", "appearance"],
    handler: ({ setTheme }) => setTheme("system"),
  },
  {
    id: "help.user.documentation",
    title: "Help: User Documentation",
    description: "Open the searchable help system.",
    category: "Help",
    keywords: ["help", "documentation", "support"],
    handler: ({ setView }) => setView("help"),
  },
  {
    id: "help.shortcuts",
    title: "Help: Keyboard Shortcuts",
    description: "Review and edit keyboard shortcuts.",
    category: "Help",
    keywords: ["keyboard", "shortcuts", "hotkeys"],
    handler: ({ setView }) => setView("shortcuts"),
  },
  {
    id: "help.about",
    title: "Help: About",
    description: "Show product information and workspace capabilities.",
    category: "Help",
    keywords: ["about", "version", "info"],
    handler: ({ setView }) => setView("about"),
  },
];
