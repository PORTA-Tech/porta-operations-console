import { create } from 'zustand';

interface CohortState {
  selectedCohort: string;
  setSelectedCohort: (cohort: string) => void;
}

export const useCohortSlice = create<CohortState>((set) => ({
  selectedCohort: 'canary-1',
  setSelectedCohort: (selectedCohort) => set({ selectedCohort })
}));
