import { create } from 'zustand';
import type { RolloutStatusView } from '../types/apiContracts';
import type { CohortSnapshot } from '../api/cohorts';

interface FleetState {
  rollout: RolloutStatusView | undefined;
  fleetHealth: number;
  cohortDistribution: CohortSnapshot[];
  lastUpdatedUtc: string | undefined;
  liveConnected: boolean;
  sloCompliance: {
    label: 'Compliant' | 'Degraded' | 'Breached';
    scorePct: number;
  };
  haltIndicator: boolean;
  setRollout: (rollout: RolloutStatusView) => void;
  setCohorts: (cohorts: CohortSnapshot[]) => void;
  setConnectivity: (liveConnected: boolean) => void;
}

export const useFleetSlice = create<FleetState>((set) => ({
  rollout: undefined,
  fleetHealth: 100,
  cohortDistribution: [],
  lastUpdatedUtc: undefined,
  liveConnected: false,
  sloCompliance: { label: 'Compliant', scorePct: 99.5 },
  haltIndicator: false,
  setRollout: (rollout) =>
    set({
      rollout,
      lastUpdatedUtc: rollout.updatedAtUtc ?? new Date().toISOString(),
      liveConnected: true,
      fleetHealth:
        rollout.state === 'HALTED' || rollout.state === 'ROLLED_BACK'
          ? 58
          : rollout.state === 'COOLDOWN'
            ? 68
            : 96,
      sloCompliance:
        rollout.state === 'HALTED' || rollout.state === 'ROLLED_BACK'
          ? { label: 'Breached', scorePct: 91.2 }
          : rollout.state === 'COOLDOWN'
            ? { label: 'Degraded', scorePct: 95.8 }
            : { label: 'Compliant', scorePct: 99.5 },
      haltIndicator: rollout.state === 'HALTED' || rollout.state === 'ROLLED_BACK' || rollout.state === 'COOLDOWN'
    }),
  setCohorts: (cohortDistribution) => set({ cohortDistribution }),
  setConnectivity: (liveConnected) => set({ liveConnected })
}));
