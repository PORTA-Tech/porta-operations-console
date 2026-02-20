import { create } from 'zustand';
import type { CohortId } from '../types/apiContracts';
import type { CohortWindow } from '../types/ui';

interface CohortState {
  primaryCohort: CohortId;
  secondaryCohort: CohortId;
  window: CohortWindow;
  compareMode: boolean;
  setPrimaryCohort: (cohort: CohortId) => void;
  setSecondaryCohort: (cohort: CohortId) => void;
  setWindow: (window: CohortWindow) => void;
  setCompareMode: (enabled: boolean) => void;
}

export const useCohortSlice = create<CohortState>((set) => ({
  primaryCohort: 'canary-1',
  secondaryCohort: 'stable',
  window: '1h',
  compareMode: false,
  setPrimaryCohort: (primaryCohort) => set({ primaryCohort }),
  setSecondaryCohort: (secondaryCohort) => set({ secondaryCohort }),
  setWindow: (window) => set({ window }),
  setCompareMode: (compareMode) => set({ compareMode })
}));
