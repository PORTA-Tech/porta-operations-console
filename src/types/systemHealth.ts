export type SystemHealthStatus = 'Yes' | 'No' | 'Unavailable';
export type SystemHealthTone = 'healthy' | 'warning' | 'critical';

export interface SystemHealthRecord {
  machineId: string;
  machineName: string;
  userName: string;
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
