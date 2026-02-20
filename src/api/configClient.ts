import type { ConfigLedgerRecord } from '@porta/api-contracts';
import { apiRequest } from '../utils/apiHelpers';

export async function fetchCurrentConfig(): Promise<{ configSeq: number; configVersion: string; appliedAtUtc?: string }> {
  return apiRequest('/v1/config/current');
}

export async function fetchConfigLedger(): Promise<ConfigLedgerRecord[]> {
  return apiRequest('/v1/config/ledger');
}
