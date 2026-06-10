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

export type BreakKind = 'short_break' | 'long_break';

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
  // Legacy compatibility mirrors of the canonical focus-episode fields.
  // Console surfaces should not treat these as independent product truth.
  taskContinuityScore: number;
  taskContinuitySeconds: number;
  continuityState: ContinuityState;
  deepWorkActive: boolean;
  // Canonical user-facing pressure signal.
  pressureLevel: number;
  // Confidence should be shown alongside pressure instead of hiding pressure.
  pressureConfidence: number;
  // Legacy compatibility mirror of pressureLevel in fleet/admin summaries.
  overloadLikelihood: number;
  // Canonical meaning aligns with overload active.
  overloadActive: boolean;
  breakNeeded: boolean;
  // Canonical pending-break kind. Product-facing surfaces should prefer this over
  // parsing the legacy action transport field.
  breakPendingKind?: BreakKind | null;
  // Legacy compatibility mirror of breakPendingKind in fleet/admin summaries.
  // It may still carry stretch_break_suggestion or break_suggestion while
  // short-break and long-break naming migrates.
  breakPendingAction?: string | null;
  breakPendingReasonCode?: string | null;
  calibrationStage: CalibrationStage;
  trustTier: TrustTier;
  modelConfidence: number;
  signalQualityScore?: number | null;
  partialData: boolean;
  missingMajorChannels: string[];
  userAgentCaptureFailureCode?: string | null;
  watchdogLaunchFailureCode?: string | null;
  userAgentSelfTestState?: string | null;
  userAgentSelfTestErrorCode?: string | null;
  userAgentLogTail?: string | null;
  windowsUpdateStatus?: string | null;
  // Server-derived truth fields (control plane fleetReadService):
  // presence is liveness; deviceStatus only means the device credential is not revoked.
  presence?: 'online' | 'recent' | 'offline';
  offlineSinceUtc?: string | null;
  hasInputData?: boolean;
  selfTestEffective?: string | null;
  agentOutdated?: boolean;
  latestKnownAgentVersion?: string | null;
}

interface CollectionResponse<T> {
  value?: T[] | null;
  Value?: T[] | null;
  count?: number;
  Count?: number;
}

function normalizeBreakKind(value: string | null | undefined): BreakKind | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (normalized === 'short_break' || normalized === 'stretch_break_suggestion') return 'short_break';
  if (normalized === 'long_break' || normalized === 'break_suggestion') return 'long_break';
  return null;
}

function resolveLegacyBreakPendingAction(value: string | null | undefined): string | null {
  switch (normalizeBreakKind(value)) {
    case 'short_break':
      return 'stretch_break_suggestion';
    case 'long_break':
      return 'break_suggestion';
    default:
      return null;
  }
}

export function normalizeMachineSummaryReport(row: MachineSummaryReport): MachineSummaryReport {
  const focusEpisodeQuality = Number.isFinite(row.focusEpisodeQuality) ? row.focusEpisodeQuality : row.taskContinuityScore;
  const focusEpisodeSeconds = Number.isFinite(row.focusEpisodeSeconds) ? row.focusEpisodeSeconds : row.taskContinuitySeconds;
  const focusEpisodeState = row.focusEpisodeState ?? row.continuityState;
  const pressureLevel = Number.isFinite(row.pressureLevel) ? row.pressureLevel : row.overloadLikelihood;
  const pressureConfidence = Number.isFinite(row.pressureConfidence) ? row.pressureConfidence : row.modelConfidence;
  const breakPendingKind = normalizeBreakKind(row.breakPendingKind ?? row.breakPendingAction);

  return {
    ...row,
    focusEpisodeQuality,
    focusEpisodeSeconds,
    focusEpisodeState,
    taskContinuityScore: focusEpisodeQuality,
    taskContinuitySeconds: focusEpisodeSeconds,
    continuityState: focusEpisodeState,
    pressureLevel,
    pressureConfidence,
    overloadLikelihood: pressureLevel,
    breakNeeded: row.breakNeeded || breakPendingKind !== null,
    breakPendingKind,
    breakPendingAction: resolveLegacyBreakPendingAction(row.breakPendingKind ?? breakPendingKind ?? row.breakPendingAction)
  };
}

export async function fetchMachineSummaries(): Promise<MachineSummaryReport[]> {
  const response = await apiRequestRaw<MachineSummaryReport[] | CollectionResponse<MachineSummaryReport>>({
    path: '/v1/machines/summary',
    method: 'get'
  });

  if (Array.isArray(response)) {
    return response.map(normalizeMachineSummaryReport);
  }

  return (response.value ?? response.Value ?? []).map(normalizeMachineSummaryReport);
}

export async function fetchMachineSummary(machineId: string): Promise<MachineSummaryReport> {
  const response = await apiRequestRaw<MachineSummaryReport>({
    path: `/v1/machines/${encodeURIComponent(machineId)}`,
    method: 'get'
  });
  return normalizeMachineSummaryReport(response);
}

export interface UptimeSample {
  machineId: string;
  sampledAtUtc: string;
  agentRunning: boolean;
  userSessionConnected: boolean;
  activityDetected: boolean;
}

export async function fetchMachineUptime(machineId: string, days = 7): Promise<UptimeSample[]> {
  return apiRequestRaw<UptimeSample[]>({
    path: `/v1/machines/${encodeURIComponent(machineId)}/uptime?days=${days}`,
    method: 'get'
  });
}
