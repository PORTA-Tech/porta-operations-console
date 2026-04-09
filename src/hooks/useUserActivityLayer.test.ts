import { describe, expect, it } from 'vitest';
import type { MachineSummaryReport } from '../api/machines';
import { describeActivityReason } from './useUserActivityLayer';

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
    focusEpisodeReasonCode: 'focus_episode_active',
    focusEpisodeReasonText: 'Focus episode active.',
    attentionSegmentKind: 'focus',
    attentionSegmentSeconds: 0,
    attentionSegmentReasonCode: 'steady_focus',
    attentionSegmentReasonText: 'Steady focus episode.',
    distractionEpisodeActive: false,
    distractionEpisodeSeconds: 0,
    taskContinuityScore: 0.9,
    taskContinuitySeconds: 600,
    continuityState: 'keep',
    deepWorkActive: false,
    pressureLevel: 0.18,
    pressureConfidence: 0.9,
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

describe('describeActivityReason', () => {
  it('prefers the attention-segment explanation when present', () => {
    const summary = buildSummary({
      attentionSegmentKind: 'fragmentation_distraction',
      attentionSegmentReasonText: 'Rapid switching / fragmentation for 3m.'
    });

    expect(describeActivityReason(summary, false)).toBe('Rapid switching / fragmentation for 3m.');
  });

  it('falls back to the focus-episode explanation when no segment reason is present', () => {
    const summary = buildSummary({
      attentionSegmentReasonText: null,
      focusEpisodeState: 'pause',
      focusEpisodeReasonText: 'Focus episode is paused during a short reading or thinking pause.'
    });

    expect(describeActivityReason(summary, false)).toBe('Focus episode is paused during a short reading or thinking pause.');
  });

  it('suppresses activity reasons when the row is stale', () => {
    const summary = buildSummary({
      attentionSegmentReasonText: 'Away for 6m.'
    });

    expect(describeActivityReason(summary, true)).toBeNull();
  });
});
