import type { AuditEvent } from '../types/contracts';
import { apiRequest } from '../utils/apiHelpers';

export async function fetchRolloutAudit(limit = 200): Promise<AuditEvent[]> {
  return apiRequest(`/v1/audit/rollout-events?limit=${limit}`);
}

export async function fetchOutboxStatus(): Promise<{ queued: number; delivered: number; pending: number }> {
  return apiRequest('/v1/audit/outbox/status');
}
