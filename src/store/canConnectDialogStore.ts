/**
 * canConnectDialogStore.ts
 * ------------------------------------------------------------
 * Zustand store for managing the state of the CAN connection dialog.
 *
 * RESPONSIBILITY
 * - Manages the open/closed state of the CAN connection dialog.
 * - Provides methods to open and close the dialog.
 *
 * CONVENTIONS
 * - Uses Zustand for state management.
 * - Pure UI concern, no derived or computed state.
 *
 * HOW TO USE
 * - Import the store using `useConnectDialogStore`.
 * - Call `openDialog` to open the CAN connection dialog.
 * - Call `closeDialog` to close the CAN connection dialog.
 */

import { create } from "zustand";

type ConnectDialogState = {
  open: boolean;
  openDialog: () => void;
  closeDialog: () => void;
};

export const useConnectDialogStore = create<ConnectDialogState>((set) => ({
  open: false,
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
}));
