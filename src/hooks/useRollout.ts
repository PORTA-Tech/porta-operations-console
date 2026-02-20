import type { RolloutMutationResult } from '../api/rollout';
import { forceRollback, initiatePromotion, pauseRollout, resumeRollout } from '../api/rollout';

export function useRollout(): {
  initiatePromotion: () => Promise<RolloutMutationResult>;
  pauseRollout: () => Promise<RolloutMutationResult>;
  resumeRollout: () => Promise<RolloutMutationResult>;
  forceRollback: () => Promise<RolloutMutationResult>;
} {
  return {
    initiatePromotion: async () => initiatePromotion(),
    pauseRollout: async () => pauseRollout(),
    resumeRollout: async () => resumeRollout(),
    forceRollback: async () => forceRollback()
  };
}

