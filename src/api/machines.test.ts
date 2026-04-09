import { describe, expect, it } from 'vitest';
import { normalizeMachineSummaryReport, type MachineSummaryReport } from './machines';

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
    overloadLikelihood: 0.18,
    overloadActive: false,
    breakNeeded: false,
    breakPendingKind: null,
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

describe('normalizeMachineSummaryReport', () => {
  it('keeps canonical fields authoritative and mirrors legacy aliases from them', () => {
    const normalized = normalizeMachineSummaryReport(buildSummary({
      focusEpisodeQuality: 0.87,
      focusEpisodeSeconds: 1200,
      focusEpisodeState: 'pause',
      taskContinuityScore: 0.12,
      taskContinuitySeconds: 45,
      continuityState: 'reset',
      pressureLevel: 0.72,
      overloadLikelihood: 0.19,
      breakNeeded: false,
      breakPendingKind: 'long_break',
      breakPendingAction: 'stretch_break_suggestion'
    }));

    expect(normalized.focusEpisodeQuality).toBe(0.87);
    expect(normalized.taskContinuityScore).toBe(0.87);
    expect(normalized.focusEpisodeSeconds).toBe(1200);
    expect(normalized.taskContinuitySeconds).toBe(1200);
    expect(normalized.focusEpisodeState).toBe('pause');
    expect(normalized.continuityState).toBe('pause');
    expect(normalized.pressureLevel).toBe(0.72);
    expect(normalized.overloadLikelihood).toBe(0.72);
    expect(normalized.breakNeeded).toBe(true);
    expect(normalized.breakPendingKind).toBe('long_break');
    expect(normalized.breakPendingAction).toBe('break_suggestion');
  });
});
