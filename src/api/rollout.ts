import type { RolloutStatusView } from '../types/apiContracts';
import { apiRequest } from './client';
import type { components } from './generated/controlPlane';

export type RolloutMutationResult = {
  rollout_state: RolloutStatusView['state'];
  config_seq: RolloutStatusView['activeConfigSeq'];
  cooldown_until_utc: string | undefined;
  halt_status: boolean;
  updated_at_utc: string;
};

export type RolloutDryRunView = components['schemas']['RolloutDryRunView'];

export async function getRolloutState(): Promise<RolloutStatusView> {
  return apiRequest({ path: '/v1/rollout/state', method: 'get' });
}

export async function getRolloutDryRun(): Promise<RolloutDryRunView> {
  return apiRequest({ path: '/v1/rollout/dry-run', method: 'get' });
}

function toMutationResult(state: RolloutStatusView): RolloutMutationResult {
  return {
    rollout_state: state.state,
    config_seq: state.activeConfigSeq,
    cooldown_until_utc: state.cooldownUntilUtc,
    halt_status: state.state === 'HALTED' || state.state === 'ROLLED_BACK' || state.state === 'COOLDOWN',
    updated_at_utc: state.updatedAtUtc
  };
}

async function mutateAndRead(
  path: '/v1/rollout/promote' | '/v1/rollout/halt' | '/v1/rollout/rollback'
): Promise<RolloutMutationResult> {
  await apiRequest({ path, method: 'post' });
  const state = await getRolloutState();
  return toMutationResult(state);
}

export async function promoteRollout(): Promise<RolloutMutationResult> {
  return mutateAndRead('/v1/rollout/promote');
}

export async function haltRollout(): Promise<RolloutMutationResult> {
  return mutateAndRead('/v1/rollout/halt');
}

export async function rollbackRollout(): Promise<RolloutMutationResult> {
  return mutateAndRead('/v1/rollout/rollback');
}

export async function initiatePromotion(): Promise<RolloutMutationResult> {
  return promoteRollout();
}

export async function pauseRollout(): Promise<RolloutMutationResult> {
  return haltRollout();
}

export async function resumeRollout(): Promise<RolloutMutationResult> {
  return promoteRollout();
}

export async function forceRollback(): Promise<RolloutMutationResult> {
  return rollbackRollout();
}
