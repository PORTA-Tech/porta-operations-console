import { apiRequestRaw } from './client';

export interface AccountDeviceProfile {
  deviceId: string;
  orgId?: string | null;
  machineName: string;
  deviceDisplayName: string;
  platform: string;
  agentVersion: string;
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
  currentAccountId?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DeviceActionResponse {
  ok: boolean;
  device: AccountDeviceProfile;
}

export async function fetchAccountDevices(accountId: string): Promise<AccountDeviceProfile[]> {
  return apiRequestRaw<AccountDeviceProfile[]>({
    path: `/v1/admin/accounts/${encodeURIComponent(accountId)}/devices`,
    method: 'get'
  });
}

export async function revokeAccountDevice(accountId: string, deviceId: string): Promise<AccountDeviceProfile> {
  const response = await apiRequestRaw<DeviceActionResponse>({
    path: `/v1/admin/accounts/${encodeURIComponent(accountId)}/devices/${encodeURIComponent(deviceId)}/revoke`,
    method: 'post'
  });

  return response.device;
}

export async function unlinkAccountDevice(accountId: string, deviceId: string): Promise<AccountDeviceProfile> {
  const response = await apiRequestRaw<DeviceActionResponse>({
    path: `/v1/admin/accounts/${encodeURIComponent(accountId)}/devices/${encodeURIComponent(deviceId)}/unlink`,
    method: 'post'
  });

  return response.device;
}
