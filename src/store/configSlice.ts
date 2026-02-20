import { create } from 'zustand';

interface ConfigState {
  activeConfigSeq: number | undefined;
  activeConfigVersion: string | undefined;
  setConfig: (seq: number, version: string) => void;
}

export const useConfigSlice = create<ConfigState>((set) => ({
  activeConfigSeq: undefined,
  activeConfigVersion: undefined,
  setConfig: (activeConfigSeq, activeConfigVersion) => set({ activeConfigSeq, activeConfigVersion })
}));
