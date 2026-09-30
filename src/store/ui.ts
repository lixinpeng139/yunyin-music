import { create } from "zustand";

/** Small UI-only store: chrome visibility and transient dialogs. */
interface UiState {
  sidebarOpen: boolean;
  queueOpen: boolean;
  nowPlayingOpen: boolean;
  loginOpen: boolean;
  searchOpen: boolean;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
  setQueueOpen: (open: boolean) => void;
  setNowPlayingOpen: (open: boolean) => void;
  setLoginOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
}

function readSidebarPref(): boolean {
  try {
    // Niri users often run narrow columns; remembering the collapse is kind.
    return localStorage.getItem("yunyin.sidebar") !== "closed";
  } catch {
    return true;
  }
}

export const useUi = create<UiState>((set, get) => ({
  sidebarOpen: readSidebarPref(),
  queueOpen: false,
  nowPlayingOpen: false,
  loginOpen: false,
  searchOpen: false,

  toggleSidebar() {
    const open = !get().sidebarOpen;
    try {
      localStorage.setItem("yunyin.sidebar", open ? "open" : "closed");
    } catch {
      /* ignore */
    }
    set({ sidebarOpen: open });
  },
  setSidebar: (open) => set({ sidebarOpen: open }),
  setQueueOpen: (open) => set({ queueOpen: open }),
  setNowPlayingOpen: (open) => set({ nowPlayingOpen: open }),
  setLoginOpen: (open) => set({ loginOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
}));
