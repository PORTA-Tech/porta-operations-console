import { create } from 'zustand';
import type { RolloutStatusView } from '@porta/api-contracts';
import type { CohortSnapshot } from '../api/cohorts';

interface FleetState {
  rollout?: RolloutStatusView;
  fleetHealth: number;
  cohortDistribution: CohortSnapshot[];
  sloCompliance: {
    label: 'Compliant' | 'Degraded' | 'Breached';
    scorePct: number;
  };
  haltIndicator: boolean;
  setRollout: (rollout: RolloutStatusView) => void;
  setCohorts: (cohorts: CohortSnapshot[]) => void;
}

export const useFleetSlice = create<FleetState>((set) => ({
  rollout: undefined,
  fleetHealth: 100,
  cohortDistribution: [],
  sloCompliance: { label: 'Compliant', scorePct: 99.5 },
  haltIndicator: false,
  setRollout: (rollout) =>
    set({
      rollout,
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
  setCohorts: (cohortDistribution) => set({ cohortDistribution })
}));
