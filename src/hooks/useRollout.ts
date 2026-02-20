import type { RolloutMutationResult } from '../api/rollout';
import { haltRollout, promoteRollout, rollbackRollout } from '../api/rollout';

export function useRollout(): {
  promote: () => Promise<RolloutMutationResult>;
  halt: () => Promise<RolloutMutationResult>;
  rollback: () => Promise<RolloutMutationResult>;
} {
  return {
    promote: async () => promoteRollout(),
    halt: async () => haltRollout(),
    rollback: async () => rollbackRollout()
  };
}

