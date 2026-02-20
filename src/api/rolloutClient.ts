import type { RolloutStatusView } from '@porta/api-contracts';
import { apiRequest } from '../utils/apiHelpers';

export async function fetchRolloutState(): Promise<RolloutStatusView> {
  return apiRequest('/v1/rollout/state');
}

export async function promoteRollout(): Promise<unknown> {
  return apiRequest('/v1/rollout/promote', { method: 'POST' });
}

export async function haltRollout(): Promise<unknown> {
  return apiRequest('/v1/rollout/halt', { method: 'POST' });
}

export async function rollbackRollout(): Promise<unknown> {
  return apiRequest('/v1/rollout/rollback', { method: 'POST' });
}
