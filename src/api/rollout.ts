import type { RolloutStatusView } from '@porta/api-contracts';
import { apiRequest } from './client';

export async function getRolloutState(): Promise<RolloutStatusView> {
  return apiRequest({ path: '/v1/rollout/state', method: 'get' });
}

async function mutateAndRead(path: '/v1/rollout/promote' | '/v1/rollout/halt' | '/v1/rollout/rollback'): Promise<RolloutStatusView> {
  await apiRequest({ path, method: 'post' });
  return getRolloutState();
}

export async function promoteRollout(): Promise<RolloutStatusView> {
  return mutateAndRead('/v1/rollout/promote');
}

export async function haltRollout(): Promise<RolloutStatusView> {
  return mutateAndRead('/v1/rollout/halt');
}

export async function rollbackRollout(): Promise<RolloutStatusView> {
  return mutateAndRead('/v1/rollout/rollback');
}
