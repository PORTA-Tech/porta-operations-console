import { create } from 'zustand';

interface FleetState {
  lastUpdatedUtc: string | undefined;
  liveConnected: boolean;
  setRefreshState: (input: { lastUpdatedUtc?: string; liveConnected: boolean }) => void;
}

export const useFleetSlice = create<FleetState>((set) => ({
  lastUpdatedUtc: undefined,
  liveConnected: false,
  setRefreshState: (input) =>
    set((state) => ({
      lastUpdatedUtc: input.lastUpdatedUtc ?? state.lastUpdatedUtc,
      liveConnected: input.liveConnected
    }))
}));
