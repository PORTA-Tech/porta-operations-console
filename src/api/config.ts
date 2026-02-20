import type { ConfigLedgerRecord } from '@porta/api-contracts';
import { apiRequest, type ApiResponse } from './client';
import type { components } from './generated/controlPlane';

export type CurrentConfigView = ApiResponse<'/v1/config/current', 'get'>;

export async function getCurrentConfig(): Promise<CurrentConfigView> {
  return apiRequest({ path: '/v1/config/current', method: 'get' });
}

export async function getConfigLedger(): Promise<ConfigLedgerRecord[]> {
  return apiRequest({ path: '/v1/config/ledger', method: 'get' });
}

export type ConfigDiffPreviewView = components['schemas']['ConfigDiffPreviewView'];
export type ActiveConfigIntegrityView = components['schemas']['ActiveConfigIntegrityView'];

export async function getConfigDiffPreview(): Promise<ConfigDiffPreviewView> {
  return apiRequest({ path: '/v1/config/diff-preview', method: 'get' });
}

export async function getActiveConfigIntegrity(): Promise<ActiveConfigIntegrityView> {
  return apiRequest({ path: '/v1/config/integrity-active', method: 'get' });
}
