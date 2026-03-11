export type SystemHealthStatus = 'Yes' | 'No' | 'Unavailable';
export type SystemHealthTone = 'healthy' | 'warning' | 'critical';

export interface SystemHealthRecord {
  accountId: string | null;
  deviceId: string | null;
  machineId: string;
  machineName: string;
  userName: string;
  userDetail: string | null;
  orgRole: string | null;
  deviceStatus: string | null;
  deviceRevokedAt: string | null;
  lastSeenUtc: string | null;
  lastSeenLabel: string;
  lastSeenStale: boolean;
  agentRunning: SystemHealthStatus;
  userSessionConnected: SystemHealthStatus;
  activityDetected: SystemHealthStatus;
  lastActivityUtc: string | null;
  lastActivityLabel: string;
  lastActivityStale: boolean;
  errorMessage: string | null;
  tone: SystemHealthTone;
}
