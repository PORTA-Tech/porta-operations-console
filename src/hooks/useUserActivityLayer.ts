import { useMemo } from 'react';
import type {
  UserActivityBreakNeeded,
  UserActivityDeepWork,
  UserActivityFocusLevel,
  UserActivityOverloadRisk,
  UserActivityRecord,
  UserActivityTone
} from '../types/userActivity';
import { type MachineSummaryReport } from '../api/machines';
import {
  formatMissingChannels,
  formatMissingChannels as formatChannels,
  identityPrimaryLabel,
  identitySecondaryLabel,
  isFresh,
  machineNameLabel,
  orgRoleLabel
} from '../utils/fleetTruth';
import { useMachineSummaryFeed } from './useMachineSummaryFeed';

const STATE_FRESH_MS = 2 * 60_000;

function formatDuration(seconds: number | null, fallback: 'Unknown' | 'Unavailable'): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return fallback;

  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;

  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  if (hours > 0) {
    if (secs === 0) return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
    return `${hours}h ${minutes}m`;
  }

  if (secs === 0) return `${minutes}m`;
  return `${minutes}m ${secs}s`;
}

function mapFocusLevel(summary: MachineSummaryReport): UserActivityFocusLevel {
  if (summary.deepWorkActive) return 'High';
  if (summary.continuityState === 'keep') {
    if (summary.taskContinuitySeconds >= 900 || summary.taskContinuityScore >= 0.8) return 'High';
    if (summary.taskContinuitySeconds >= 120 || summary.taskContinuityScore >= 0.34) return 'Medium';
    return 'Low';
  }
  if (summary.continuityState === 'pause') {
    return summary.taskContinuitySeconds >= 300 ? 'Medium' : 'Low';
  }
  if (summary.continuityState === 'decay') {
    return summary.taskContinuitySeconds >= 600 ? 'Medium' : 'Low';
  }
  if (summary.taskContinuityScore >= 0.67 && summary.taskContinuitySeconds >= 900) return 'High';
  if (summary.taskContinuityScore >= 0.34 || summary.taskContinuitySeconds >= 120) return 'Medium';
  return 'Low';
}

function mapDeepWork(summary: MachineSummaryReport): UserActivityDeepWork {
  return summary.deepWorkActive ? 'Active' : 'Not active';
}

function mapOverloadRisk(summary: MachineSummaryReport): UserActivityOverloadRisk {
  if (summary.overloadActive || summary.overloadLikelihood >= 0.72) return 'High';
  if (summary.overloadLikelihood >= 0.4) return 'Medium';
  return 'Low';
}

function mapBreakNeeded(summary: MachineSummaryReport): UserActivityBreakNeeded {
  return summary.breakNeeded || summary.breakPendingAction ? 'Yes' : 'No';
}

function deriveNote(summary: MachineSummaryReport, stateStale: boolean): string | null {
  if (!summary.agentRunning) return 'Agent is not running';
  if (stateStale) return 'Behavior state is stale';
  if (!summary.userSessionConnected) return 'No live user session is connected';
  if (summary.partialData && summary.missingMajorChannels.length > 0) {
    return `Behavior state is partial: missing ${formatChannels(summary.missingMajorChannels)} signals`;
  }
  if (summary.partialData) return 'Behavior state is partial';
  if (summary.missingMajorChannels.length > 0) {
    return `Behavior state is limited: missing ${formatMissingChannels(summary.missingMajorChannels)} signals`;
  }
  if (!summary.activityDetected && !summary.deepWorkActive) return 'No recent activity detected';
  return null;
}

function deriveTone(summary: MachineSummaryReport, stateStale: boolean, note: string | null): UserActivityTone {
  if (!summary.agentRunning || !summary.userSessionConnected || stateStale) return 'unavailable';
  if (note) return 'limited';
  return 'live';
}

export function useUserActivityLayer(): {
  records: UserActivityRecord[];
  loading: boolean;
  error: import('../api/client').ApiError | undefined;
  lastRefreshUtc: string | undefined;
  notices: string[];
} {
  const feed = useMachineSummaryFeed();

  const records = useMemo<UserActivityRecord[]>(() => (
    feed.rows
      .map((summary) => {
        const stateStale = !isFresh(summary.reportedAtUtc, STATE_FRESH_MS);
        const note = deriveNote(summary, stateStale);
        const tone = deriveTone(summary, stateStale, note);
        const focusDurationSec = summary.taskContinuitySeconds;

        return {
          machineId: summary.machineId,
          machineName: machineNameLabel(summary.machineName),
          userName: identityPrimaryLabel(summary.displayName, summary.userName),
          userDetail: identitySecondaryLabel(summary.displayName, summary.primaryEmail, summary.userName),
          orgRole: orgRoleLabel(summary.orgName, summary.role),
          focusLevel: tone === 'unavailable' ? 'Unavailable' : mapFocusLevel(summary),
          deepWork: tone === 'unavailable' ? 'Unavailable' : mapDeepWork(summary),
          overloadRisk: tone === 'unavailable' ? 'Unavailable' : mapOverloadRisk(summary),
          focusDurationSec: tone === 'unavailable' ? null : focusDurationSec,
          focusDurationLabel: tone === 'unavailable'
            ? formatDuration(null, 'Unavailable')
            : formatDuration(focusDurationSec, 'Unknown'),
          breakNeeded: tone === 'unavailable' ? 'Unavailable' : mapBreakNeeded(summary),
          stateTimestampUtc: summary.reportedAtUtc,
          stateStale,
          note,
          tone
        } satisfies UserActivityRecord;
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
      return ['No user-activity rows are available because /v1/machines/summary returned no machines.'];
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
