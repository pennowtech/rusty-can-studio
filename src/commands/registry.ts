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
];
