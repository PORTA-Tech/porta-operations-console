import { haltRollout, promoteRollout, rollbackRollout } from '../api/rolloutClient';

export function useRollout(): {
  promote: () => Promise<void>;
  halt: () => Promise<void>;
  rollback: () => Promise<void>;
} {
  return {
    promote: async () => {
      await promoteRollout();
    },
    halt: async () => {
      await haltRollout();
    },
    rollback: async () => {
      await rollbackRollout();
    }
  };
}
