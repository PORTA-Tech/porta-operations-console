import type { AuditEvent } from '@porta/api-contracts';
import { apiRequest } from './client';
import type { components } from './generated/controlPlane';

export async function getRolloutAuditEvents(): Promise<AuditEvent[]> {
  return apiRequest({ path: '/v1/audit/rollout-events', method: 'get' });
}

export type AuditLedgerRow = components['schemas']['AuditLedgerRow'];

export async function getAuditLedgerView(): Promise<AuditLedgerRow[]> {
  return apiRequest({ path: '/v1/audit/ledger-view', method: 'get' });
}
