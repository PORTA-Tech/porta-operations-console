import { apiRequestRaw } from './client';

export type CaptureContext = 'Unknown' | 'UserSession' | 'ServiceSession';
export type ContinuityState = 'keep' | 'pause' | 'decay' | 'reset';
export type CalibrationStage = 'cold' | 'provisional' | 'calibrated';
export type TrustTier = 'low' | 'medium' | 'high';
export type AttentionSegmentKind =
  | 'focus'
  | 'context_excursion'
  | 'off_task_distraction'
  | 'fragmentation_distraction'
  | 'away';

export interface MachineSummaryReport {
  deviceId?: string;
  accountId?: string | null;
  orgId?: string | null;
  deviceStatus?: string | null;
  deviceRevokedAt?: string | null;
  machineId: string;
  machineName: string;
  userName: string;
  displayName?: string | null;
  primaryEmail?: string | null;
  orgName?: string | null;
  role?: string | null;
  agentVersion: string;
  schemaVersion: string;
  policyVersion: string;
  reportedAtUtc: string;
  agentRunning: boolean;
  userSessionConnected: boolean;
  activityDetected: boolean;
  lastActivityUtc?: string | null;
  userAgentHeartbeatUtc?: string | null;
  userAgentHeartbeatAgeSeconds?: number | null;
  lastAcceptedInputAgeSeconds?: number | null;
  userAgentStartupSource?: string | null;
  userAgentStartupState?: string | null;
  userAgentLastLaunchReason?: string | null;
  userAgentHeartbeatWriteFailureCount?: number | null;
  captureContext: CaptureContext;
  keyboardSignalActive: boolean;
  mouseSignalActive: boolean;
  ownershipWarning?: string | null;
  captureFailureReason?: string | null;
  lastError?: string | null;
  backendConnected: boolean;
  localApiAuthReady: boolean;
  dbMigrationFailed: boolean;
  // Canonical durable focus-episode fields. These are the product-facing fields
  // that operator views should prefer over the legacy continuity aliases.
  focusEpisodeQuality: number;
  focusEpisodeSeconds: number;
  focusEpisodeState: ContinuityState;
  focusEpisodeReasonCode?: string | null;
  focusEpisodeReasonText?: string | null;
  attentionSegmentKind: AttentionSegmentKind;
  attentionSegmentSeconds: number;
  attentionSegmentReasonCode?: string | null;
  attentionSegmentReasonText?: string | null;
  distractionEpisodeActive: boolean;
  distractionEpisodeSeconds: number;
  // Legacy compatibility fields mirrored from the shared machine summary DTO.
  // The product target is focus-episode quality and focus-episode duration.
  taskContinuityScore: number;
  taskContinuitySeconds: number;
  continuityState: ContinuityState;
  deepWorkActive: boolean;
  // Canonical user-facing pressure signal.
  pressureLevel: number;
  // Confidence should be shown alongside pressure instead of hiding pressure.
  pressureConfidence: number;
  // Legacy visible overload field. The product target is Pressure.
  overloadLikelihood: number;
  // Canonical meaning aligns with overload active.
  overloadActive: boolean;
  breakNeeded: boolean;
  // Legacy break transport field. It may still carry stretch_break_suggestion
  // or break_suggestion while short-break and long-break naming migrates.
  breakPendingAction?: string | null;
  breakPendingReasonCode?: string | null;
  calibrationStage: CalibrationStage;
  trustTier: TrustTier;
  modelConfidence: number;
  signalQualityScore?: number | null;
  partialData: boolean;
  missingMajorChannels: string[];
}

interface CollectionResponse<T> {
  value?: T[] | null;
  Value?: T[] | null;
  count?: number;
  Count?: number;
}

export async function fetchMachineSummaries(): Promise<MachineSummaryReport[]> {
  const response = await apiRequestRaw<MachineSummaryReport[] | CollectionResponse<MachineSummaryReport>>({
    path: '/v1/machines/summary',
    method: 'get'
  });

  if (Array.isArray(response)) {
    return response;
  }

  return response.value ?? response.Value ?? [];
}

export async function fetchMachineSummary(machineId: string): Promise<MachineSummaryReport> {
  return apiRequestRaw<MachineSummaryReport>({
    path: `/v1/machines/${encodeURIComponent(machineId)}`,
    method: 'get'
  });
}
