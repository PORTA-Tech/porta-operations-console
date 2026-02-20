import type { CohortId, RolloutStatusView } from '@porta/api-contracts';
import { getFleetState } from './fleet';

export type CohortSnapshot = {
  cohortId: CohortId;
  exposurePct: number;
  status: RolloutStatusView['state'];
};

// Backend cohort endpoints are pending; this mirrors 8A rollout state for now.
export async function getCohortSnapshots(): Promise<CohortSnapshot[]> {
  const state = await getFleetState();
  return [
    { cohortId: 'canary-1', exposurePct: 1, status: state.state },
    { cohortId: 'canary-5', exposurePct: 5, status: state.state },
    { cohortId: 'stable', exposurePct: 94, status: state.state }
  ];
}
