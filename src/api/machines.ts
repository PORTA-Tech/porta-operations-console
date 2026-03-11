import { apiRequestRaw } from './client';

export type CaptureContext = 'Unknown' | 'UserSession' | 'ServiceSession';
export type ContinuityState = 'keep' | 'pause' | 'decay' | 'reset';
export type CalibrationStage = 'cold' | 'provisional' | 'calibrated';
export type TrustTier = 'low' | 'medium' | 'high';

export interface MachineSummaryReport {
  machineId: string;
  machineName: string;
  userName: string;
  agentVersion: string;
  schemaVersion: string;
  policyVersion: string;
  reportedAtUtc: string;
  agentRunning: boolean;
  userSessionConnected: boolean;
  activityDetected: boolean;
  lastActivityUtc?: string | null;
  userAgentHeartbeatUtc?: string | null;
  captureContext: CaptureContext;
  keyboardSignalActive: boolean;
  mouseSignalActive: boolean;
  ownershipWarning?: string | null;
  captureFailureReason?: string | null;
  lastError?: string | null;
  backendConnected: boolean;
  localApiAuthReady: boolean;
  dbMigrationFailed: boolean;
  taskContinuityScore: number;
  taskContinuitySeconds: number;
  continuityState: ContinuityState;
  deepWorkActive: boolean;
  overloadLikelihood: number;
  overloadActive: boolean;
  breakNeeded: boolean;
  breakPendingAction?: string | null;
  breakPendingReasonCode?: string | null;
  calibrationStage: CalibrationStage;
  trustTier: TrustTier;
  modelConfidence: number;
  signalQualityScore?: number | null;
  partialData: boolean;
  missingMajorChannels: string[];
}

export async function fetchMachineSummaries(): Promise<MachineSummaryReport[]> {
  return apiRequestRaw<MachineSummaryReport[]>({
    path: '/v1/machines/summary',
    method: 'get'
  });
}

export async function fetchMachineSummary(machineId: string): Promise<MachineSummaryReport> {
  return apiRequestRaw<MachineSummaryReport>({
    path: `/v1/machines/${encodeURIComponent(machineId)}`,
    method: 'get'
  });
}
