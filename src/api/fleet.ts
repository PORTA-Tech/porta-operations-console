import type { RolloutStatusView } from '../types/apiContracts';
import { apiRequest } from './client';

export async function getHealth(): Promise<{ ok: boolean }> {
  return apiRequest({ path: '/health', method: 'get' });
}

export async function getFleetState(): Promise<RolloutStatusView> {
  return apiRequest({ path: '/v1/rollout/state', method: 'get' });
}
