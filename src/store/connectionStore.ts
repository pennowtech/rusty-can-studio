/**
 * connectionStore.ts
 * ------------------------------------------------------------
 * Zustand store for managing connection profiles and state.
 *
 * RESPONSIBILITY
 * - Stores connection profiles
 * - Manages active connection state
 * - Provides methods to add, update, delete profiles
 * - Persists profiles to localStorage
 *
 * CONVENTIONS
 * - Uses localStorage for persistence
 * - Profiles are loaded on initialization
 * - Active connection is tracked by ID
 *
 * HOW TO USE
 * - Import useConnectionStore to access connection state and methods.
 */

import { create } from "zustand";
import { ConnectionProfile } from "@/model/connection";
import { STORAGE_KEY } from "@/utils/consts";

// Define the shape of the connection state
// - includes list of profiles and active connection ID
// - includes methods to manage connections and profiles
type ConnectionState = {
  profiles: ConnectionProfile[];
  activeId?: string;

  connect: (id: string) => void;
  disconnect: () => void;

  addProfile: (p: ConnectionProfile) => void;
  updateProfile: (p: ConnectionProfile) => void;
  deleteProfile: (id: string) => void;
};

function loadProfiles(): ConnectionProfile[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY.CONNECTIONS) ?? "[]");
  } catch {
    return [];
  }
}

function saveProfiles(p: ConnectionProfile[]) {
  localStorage.setItem(STORAGE_KEY.CONNECTIONS, JSON.stringify(p));
}

// Create the Zustand store for connection state
// - manages connection profiles and active connection
// - provides methods to connect, disconnect, and manage profiles
// - persists profiles to localStorage
export const useConnectionStore = create<ConnectionState>((set, get) => ({
  profiles: loadProfiles(),
  activeId: undefined,

  setActive: (id?: string) => set({ activeId: id }),

  getActiveProfile: () => {
    const { profiles, activeId } = get();
    return profiles.find((p) => p.id === activeId);
  },

  connect: (id) => {
    set({ activeId: id });
    // TODO: actual CAN bridge connect happens later (Tauri)
  },

  disconnect: () => set({ activeId: undefined }),

  addProfile: (p) =>
    set((s) => {
      if (s.profiles.some((x) => x.id === p.id)) {
        console.warn("Duplicate connection profile id", p.id);
        return s;
      }
      const profiles = [...s.profiles, p];
      saveProfiles(profiles);
      return { profiles };
    }),

  updateProfile: (p) =>
    set((s) => {
      const profiles = s.profiles.map((x) => (x.id === p.id ? p : x));
      saveProfiles(profiles);
      return { profiles };
    }),

  deleteProfile: (id) =>
    set((s) => {
      const profiles = s.profiles.filter((p) => p.id !== id);
      saveProfiles(profiles);
      return { profiles };
    }),
}));
