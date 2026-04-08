import { describe, expect, it } from 'vitest';
import type { MachineSummaryReport } from '../api/machines';
import { deriveSystemError } from './fleetTruth';

function buildSummary(overrides: Partial<MachineSummaryReport> = {}): MachineSummaryReport {
  return {
    machineId: 'machine-1',
    machineName: 'DESKTOP-TEST',
    userName: 'tester',
    agentVersion: '1.0.7',
    schemaVersion: '1',
    policyVersion: '1',
    reportedAtUtc: '2026-03-24T10:00:00.000Z',
    agentRunning: true,
    userSessionConnected: true,
    activityDetected: true,
    lastActivityUtc: '2026-03-24T09:59:55.000Z',
    userAgentHeartbeatUtc: '2026-03-24T09:59:59.000Z',
    userAgentHeartbeatAgeSeconds: 1,
    lastAcceptedInputAgeSeconds: 5,
    userAgentStartupSource: 'run-key',
    userAgentStartupState: 'healthy',
    userAgentLastLaunchReason: 'run-key',
    userAgentHeartbeatWriteFailureCount: 0,
    captureContext: 'UserSession',
    keyboardSignalActive: true,
    mouseSignalActive: true,
    ownershipWarning: null,
    captureFailureReason: null,
    lastError: null,
    backendConnected: true,
    localApiAuthReady: true,
    dbMigrationFailed: false,
    focusEpisodeQuality: 0.9,
    focusEpisodeSeconds: 600,
    focusEpisodeState: 'keep',
    taskContinuityScore: 0.9,
    taskContinuitySeconds: 600,
    continuityState: 'keep',
    deepWorkActive: false,
    overloadLikelihood: 0.1,
    overloadActive: false,
    breakNeeded: false,
    breakPendingAction: null,
    breakPendingReasonCode: null,
    calibrationStage: 'calibrated',
    trustTier: 'high',
    modelConfidence: 0.9,
    signalQualityScore: 0.9,
    partialData: false,
    missingMajorChannels: [],
    ...overrides
  };
}

describe('deriveSystemError', () => {
  it('shows stale summary before old ownership warnings', () => {
    const summary = buildSummary({
      ownershipWarning: 'USER_AGENT_HEARTBEAT_MISSING',
      captureFailureReason: 'USER_AGENT_HEARTBEAT_STALE'
    });

    expect(deriveSystemError(summary, true)).toBe('Machine summary stale');
  });

  it('still shows ownership warnings on fresh machines', () => {
    const summary = buildSummary({
      ownershipWarning: 'USER_AGENT_HEARTBEAT_MISSING'
    });

    expect(deriveSystemError(summary, false)).toBe('Last input owner has no fresh user-agent heartbeat');
  });
});
