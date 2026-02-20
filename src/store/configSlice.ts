import { create } from 'zustand';

interface ConfigState {
  activeConfigSeq?: number;
  activeConfigVersion?: string;
  setConfig: (seq: number, version: string) => void;
}

export const useConfigSlice = create<ConfigState>((set) => ({
  activeConfigSeq: undefined,
  activeConfigVersion: undefined,
  setConfig: (activeConfigSeq, activeConfigVersion) => set({ activeConfigSeq, activeConfigVersion })
}));
