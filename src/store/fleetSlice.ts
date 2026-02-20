import { create } from 'zustand';
import type { RolloutStatusView } from '../types/contracts';

interface FleetState {
  rollout?: RolloutStatusView;
  fleetHealth: number;
  setRollout: (rollout: RolloutStatusView) => void;
}

export const useFleetSlice = create<FleetState>((set) => ({
  rollout: undefined,
  fleetHealth: 100,
  setRollout: (rollout) =>
    set({
      rollout,
      fleetHealth: rollout.state === 'HALTED' || rollout.state === 'ROLLED_BACK' ? 62 : 96
    })
}));
