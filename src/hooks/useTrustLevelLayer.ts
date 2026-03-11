import { useMemo } from 'react';
import type {
  TrustConfidence,
  TrustDataQuality,
  TrustLearningStage,
  TrustLevelRecord,
  TrustLevelTone
} from '../types/trustLevel';
import { type MachineSummaryReport } from '../api/machines';
import {
  formatMissingChannels,
  identityPrimaryLabel,
  identitySecondaryLabel,
  isFresh,
  machineNameLabel,
  orgRoleLabel
} from '../utils/fleetTruth';
import { useMachineSummaryFeed } from './useMachineSummaryFeed';

const STATE_FRESH_MS = 2 * 60_000;
const QUALITY_POOR_THRESHOLD = 0.55;
const QUALITY_GOOD_THRESHOLD = 0.65;
const CONFIDENCE_MEDIUM_THRESHOLD = 0.5;
const CONFIDENCE_HIGH_THRESHOLD = 0.75;

function mapLearningStage(summary: MachineSummaryReport): TrustLearningStage {
  return summary.calibrationStage === 'calibrated' ? 'Ready' : 'Learning';
}

function mapConfidence(summary: MachineSummaryReport): TrustConfidence {
  if (summary.modelConfidence >= CONFIDENCE_HIGH_THRESHOLD) return 'High';
  if (summary.modelConfidence >= CONFIDENCE_MEDIUM_THRESHOLD) return 'Medium';
  return 'Low';
}

function mapDataQuality(summary: MachineSummaryReport): TrustDataQuality {
  if (summary.partialData) return 'Partial';
  if (summary.signalQualityScore === null || summary.signalQualityScore === undefined) return 'Poor';
  if (summary.signalQualityScore < QUALITY_POOR_THRESHOLD) return 'Poor';
  if (summary.signalQualityScore < QUALITY_GOOD_THRESHOLD) return 'Partial';
  return 'Good';
}

function deriveNote(summary: MachineSummaryReport, stateStale: boolean): string | null {
  if (!summary.agentRunning) return 'Agent is not running';
  if (stateStale) return 'Trust state is stale';
  if (!summary.userSessionConnected) return 'No live user session is connected';
  if (summary.calibrationStage === 'cold') return 'Calibration is still bootstrapping';
  if (summary.calibrationStage === 'provisional') return 'Calibration is still provisional';
  if (summary.partialData && summary.missingMajorChannels.length > 0) {
    return `Confidence is limited by missing ${formatMissingChannels(summary.missingMajorChannels)} signals`;
  }
  if (summary.partialData) return 'Confidence is limited by partial data';
  return null;
}

function deriveTone(summary: MachineSummaryReport, stateStale: boolean, note: string | null): TrustLevelTone {
  if (!summary.agentRunning || !summary.userSessionConnected || stateStale) return 'unavailable';
  if (note) return 'limited';
  return 'live';
}

export function useTrustLevelLayer(): {
  records: TrustLevelRecord[];
  loading: boolean;
  error: import('../api/client').ApiError | undefined;
  lastRefreshUtc: string | undefined;
  notices: string[];
} {
  const feed = useMachineSummaryFeed();

  const records = useMemo<TrustLevelRecord[]>(() => (
    feed.rows
      .map((summary) => {
        const stateStale = !isFresh(summary.reportedAtUtc, STATE_FRESH_MS);
        const note = deriveNote(summary, stateStale);
        const tone = deriveTone(summary, stateStale, note);

        return {
          machineId: summary.machineId,
          machineName: machineNameLabel(summary.machineName),
          userName: identityPrimaryLabel(summary.displayName, summary.userName),
          userDetail: identitySecondaryLabel(summary.displayName, summary.primaryEmail, summary.userName),
          orgRole: orgRoleLabel(summary.orgName, summary.role),
          learningStage: mapLearningStage(summary),
          confidence: mapConfidence(summary),
          dataQuality: mapDataQuality(summary),
          stateTimestampUtc: summary.reportedAtUtc,
          stateStale,
          note,
          tone
        } satisfies TrustLevelRecord;
      })
      .sort((left, right) => {
        const rank = { unavailable: 0, limited: 1, live: 2 };
        if (left.tone !== right.tone) return rank[left.tone] - rank[right.tone];
        return Date.parse(right.stateTimestampUtc ?? '') - Date.parse(left.stateTimestampUtc ?? '');
      })
  ), [feed.rows]);

  const notices = useMemo(() => {
    if (feed.loading || feed.error) return [];
    if (feed.rows.length === 0) {
      return ['No trust rows are available because /v1/machines/summary returned no machines.'];
    }
    return [];
  }, [feed.error, feed.loading, feed.rows.length]);

  return useMemo(
    () => ({
      records,
      loading: feed.loading,
      error: feed.error,
      lastRefreshUtc: feed.lastRefreshUtc,
      notices
    }),
    [feed.error, feed.lastRefreshUtc, feed.loading, notices, records]
  );
}
