// store/uiStore.ts
import { create } from "zustand";

export const useUiStore = create<{
  connectionManagerOpen: boolean;
  openConnectionManager: () => void;
  closeConnectionManager: () => void;
}>((set) => ({
  connectionManagerOpen: false,
  openConnectionManager: () => set({ connectionManagerOpen: true }),
  closeConnectionManager: () => set({ connectionManagerOpen: false }),
}));
