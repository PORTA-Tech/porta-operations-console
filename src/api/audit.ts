import type { AuditEvent } from '../types/apiContracts';
import { apiRequest, apiRequestRaw } from './client';
import type { components } from './generated/controlPlane';

export async function getRolloutAuditEvents(limit = 300): Promise<AuditEvent[]> {
  const size = Math.max(1, Math.min(1000, Math.trunc(limit)));
  return apiRequestRaw<AuditEvent[]>({ path: `/v1/audit/rollout-events?limit=${size}`, method: 'get' });
}

export type AuditLedgerRow = components['schemas']['AuditLedgerRow'];

export async function getAuditLedgerView(): Promise<AuditLedgerRow[]> {
  return apiRequest({ path: '/v1/audit/ledger-view', method: 'get' });
}
