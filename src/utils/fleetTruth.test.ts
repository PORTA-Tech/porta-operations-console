import { describe, expect, it } from 'vitest';
import type { MachineSummaryReport } from '../api/machines';
import {
  captureDegradationReasons,
  classifyMachine,
  countActiveDays,
  countDistractionPatterns,
  deriveSystemError,
  hasMeaningfulCalibration,
  hasNoLiveActivity,
  isActiveNow,
  isLiveState,
  isSegmentStale,
  machinePresence
} from './fleetTruth';

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
    attentionSegmentKind: 'focus',
    attentionSegmentSeconds: 0,
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

// Fixtures modeled on the real fleet observed on 2026-06-12. Names map to the
// actual machines so regressions are easy to recognize.
function buildFleet(): MachineSummaryReport[] {
  return [
    // ONLINE, signed in, activity, but realtime channel missing — the machine
    // that used to be double-counted as Healthy AND Degraded.
    buildSummary({ machineId: 'desktop-0mmjh0i', presence: 'online', activityDetected: true, hasInputData: true, missingMajorChannels: ['realtime'] }),
    // RECENT, clean, activity on last report.
    buildSummary({ machineId: 'desktop-g014lvj', presence: 'recent', activityDetected: true, hasInputData: true }),
    // RECENT, not signed in, no activity, never captured input.
    buildSummary({ machineId: 'desktop-842sqfp', presence: 'recent', activityDetected: false, hasInputData: false, accountId: null }),
    // OFFLINE 1h — last report still says activityDetected: true (stale flag).
    buildSummary({ machineId: 'aymene', presence: 'offline', activityDetected: true }),
    // OFFLINE 19h with stale heartbeat error — also a stale activity flag.
    buildSummary({ machineId: 'ebby', presence: 'offline', activityDetected: true, captureFailureReason: 'USER_AGENT_HEARTBEAT_STALE' }),
    buildSummary({ machineId: 'joycerusse', presence: 'offline', activityDetected: false, hasInputData: false }),
    buildSummary({ machineId: 'zachhug', presence: 'offline', activityDetected: false, hasInputData: false }),
    buildSummary({ machineId: 'naji-laptop', presence: 'offline', activityDetected: false, hasInputData: false }),
    buildSummary({ machineId: 'dorreyes', presence: 'offline', activityDetected: false, hasInputData: false }),
    buildSummary({ machineId: 'danish', presence: 'offline', activityDetected: false, hasInputData: false })
  ];
}

describe('classifyMachine', () => {
  it('puts every machine in exactly one bucket — counts always sum to the fleet size', () => {
    const fleet = buildFleet();
    const buckets = fleet.map(classifyMachine);
    const healthy = buckets.filter((b) => b === 'healthy').length;
    const degraded = buckets.filter((b) => b === 'degraded').length;
    const disconnected = buckets.filter((b) => b === 'disconnected').length;

    expect(healthy + degraded + disconnected).toBe(fleet.length);
  });

  it('classifies the observed fleet correctly', () => {
    const fleet = buildFleet();
    const byId = Object.fromEntries(fleet.map((row) => [row.machineId, classifyMachine(row)]));

    expect(byId['desktop-0mmjh0i']).toBe('degraded'); // missing channel — no longer also healthy
    expect(byId['desktop-g014lvj']).toBe('healthy'); // recent + clean = healthy
    expect(byId['desktop-842sqfp']).toBe('degraded'); // never captured input
    expect(byId['aymene']).toBe('disconnected');
    expect(byId['danish']).toBe('disconnected');
  });

  it('treats a missing channel as degraded, never healthy', () => {
    const row = buildSummary({ presence: 'online', missingMajorChannels: ['keyboard'] });
    expect(classifyMachine(row)).toBe('degraded');
    expect(captureDegradationReasons(row)).toHaveLength(1);
  });

  it('treats lastError as degraded (rule lived only in the healthy filter before)', () => {
    const row = buildSummary({ presence: 'online', lastError: 'boom' });
    expect(classifyMachine(row)).toBe('degraded');
  });

  it('falls back to agentRunning when presence is missing (old control planes)', () => {
    expect(machinePresence(buildSummary({ agentRunning: false }))).toBe('offline');
    expect(machinePresence(buildSummary({ agentRunning: true }))).toBe('online');
  });
});

describe('isActiveNow', () => {
  it('never counts an offline machine, even when its last report said activityDetected', () => {
    const fleet = buildFleet();
    expect(fleet.filter(isActiveNow)).toHaveLength(2); // 0MMJH0I + G014LVJ, not AYMENE/EBBY

    const offlineButFlagged = buildSummary({ presence: 'offline', activityDetected: true });
    expect(isActiveNow(offlineButFlagged)).toBe(false);
  });
});

describe('hasNoLiveActivity', () => {
  it('only looks at connected machines', () => {
    expect(hasNoLiveActivity(buildSummary({ presence: 'offline', hasInputData: false }))).toBe(false);
    expect(hasNoLiveActivity(buildSummary({ presence: 'recent', hasInputData: false }))).toBe(true);
    expect(hasNoLiveActivity(buildSummary({ presence: 'online', hasInputData: true, activityDetected: false }))).toBe(false);
  });
});

describe('isLiveState', () => {
  it('requires online presence AND real input history', () => {
    expect(isLiveState(buildSummary({ presence: 'online', hasInputData: true }))).toBe(true);
    expect(isLiveState(buildSummary({ presence: 'online', hasInputData: false }))).toBe(false);
    expect(isLiveState(buildSummary({ presence: 'recent', hasInputData: true }))).toBe(false);
    expect(isLiveState(buildSummary({ presence: 'offline', hasInputData: true }))).toBe(false);
  });
});

describe('isSegmentStale', () => {
  it('flags absurd segment durations (the 44h "in state" case)', () => {
    expect(isSegmentStale(44 * 3600)).toBe(true);
    expect(isSegmentStale(3 * 60)).toBe(false);
    expect(isSegmentStale(null)).toBe(false);
    expect(isSegmentStale(undefined)).toBe(false);
  });
});

describe('countDistractionPatterns', () => {
  it('matches on attentionSegmentKind, where the values actually live', () => {
    const rows = [
      buildSummary({ attentionSegmentKind: 'fragmentation_distraction' }),
      buildSummary({ attentionSegmentKind: 'off_task_distraction' }),
      buildSummary({ attentionSegmentKind: 'context_excursion' }),
      buildSummary({ attentionSegmentKind: 'away' }),
      buildSummary({ attentionSegmentKind: 'focus', overloadActive: true })
    ];
    const counts = countDistractionPatterns(rows);

    expect(counts.appSwitch).toBe(1);
    expect(counts.junkBrowsing).toBe(1);
    expect(counts.socialInterrupt).toBe(1);
    expect(counts.idleDrift).toBe(1);
    expect(counts.overload).toBe(1);
  });

  it('reasonCode never affects pattern counts (the old dead-code path)', () => {
    const rows = [
      buildSummary({ attentionSegmentKind: 'focus', attentionSegmentReasonCode: 'fragmentation_distraction' })
    ];
    const counts = countDistractionPatterns(rows);
    expect(counts.appSwitch).toBe(0);
  });
});

describe('hasMeaningfulCalibration', () => {
  it('includes RECENT machines but never offline or never-captured ones', () => {
    expect(hasMeaningfulCalibration(buildSummary({ presence: 'online', hasInputData: true }))).toBe(true);
    expect(hasMeaningfulCalibration(buildSummary({ presence: 'recent', hasInputData: true }))).toBe(true);
    expect(hasMeaningfulCalibration(buildSummary({ presence: 'recent', hasInputData: false }))).toBe(false);
    expect(hasMeaningfulCalibration(buildSummary({ presence: 'offline', hasInputData: true }))).toBe(false);
  });
});

describe('countActiveDays', () => {
  const dayKeys = ['2026-06-10', '2026-06-11', '2026-06-12'];
  const sample = (date: string, active: boolean) => ({
    machineId: 'm1',
    sampledAtUtc: `${date}T10:00:00.000Z`,
    agentRunning: true,
    userSessionConnected: true,
    activityDetected: active
  });

  it('counts only days with captured activity', () => {
    const samples = [
      sample('2026-06-10', true),
      sample('2026-06-11', false), // running but no activity — not a day of data
      sample('2026-06-12', true)
    ];
    expect(countActiveDays(samples, dayKeys)).toBe(2);
  });

  it('returns null (not 0) when there are no samples at all', () => {
    expect(countActiveDays([], dayKeys)).toBeNull();
  });
});
