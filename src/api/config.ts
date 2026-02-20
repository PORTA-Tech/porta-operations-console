import type { ConfigLedgerRecord } from '@porta/api-contracts';
import { apiRequest, type ApiResponse } from './client';

export type CurrentConfigView = ApiResponse<'/v1/config/current', 'get'>;

export async function getCurrentConfig(): Promise<CurrentConfigView> {
  return apiRequest({ path: '/v1/config/current', method: 'get' });
}

export async function getConfigLedger(): Promise<ConfigLedgerRecord[]> {
  return apiRequest({ path: '/v1/config/ledger', method: 'get' });
}
