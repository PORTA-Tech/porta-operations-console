import type { AuditEvent } from '@porta/api-contracts';
import { apiRequest } from './client';

export async function getRolloutAuditEvents(): Promise<AuditEvent[]> {
  return apiRequest({ path: '/v1/audit/rollout-events', method: 'get' });
}
