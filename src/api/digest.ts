import { apiRequestRaw } from './client';

export interface DigestLogEntry {
  machineId: string;
  accountId: string | null;
  dateLocal: string;
  trackedSeconds: number;
  fired: boolean;
  failureReason: string | null;
  sentAtUtc: string;
}

export async function fetchDigestLog(limit = 30): Promise<DigestLogEntry[]> {
  return apiRequestRaw<DigestLogEntry[]>({
    path: `/v1/digest/log?limit=${Math.max(1, Math.min(limit, 100))}`,
    method: 'get'
  });
}
