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

function focusEpisodeQuality(summary: MachineSummaryReport): number {
  return summary.focusEpisodeQuality;
}

function focusEpisodeSeconds(summary: MachineSummaryReport): number {
  return summary.focusEpisodeSeconds;
}

function focusEpisodeState(summary: MachineSummaryReport): MachineSummaryReport['focusEpisodeState'] {
  return summary.focusEpisodeState;
}

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

function formatPercent(value: number | null, fallback: 'Unknown' | 'Unavailable'): string {
  if (value === null || !Number.isFinite(value)) return fallback;
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function mapFocusLevel(summary: MachineSummaryReport): UserActivityFocusLevel {
  const episodeSeconds = focusEpisodeSeconds(summary);
  const episodeQuality = focusEpisodeQuality(summary);
  const episodeState = focusEpisodeState(summary);
  if (summary.deepWorkActive) return 'High';
  if (episodeState === 'keep') {
    if (episodeSeconds >= 900 || episodeQuality >= 0.8) return 'High';
    if (episodeSeconds >= 120 || episodeQuality >= 0.34) return 'Medium';
    return 'Low';
  }
  if (episodeState === 'pause') {
    return episodeSeconds >= 300 ? 'Medium' : 'Low';
  }
  if (episodeState === 'decay') {
    return episodeSeconds >= 600 ? 'Medium' : 'Low';
  }
  if (episodeQuality >= 0.67 && episodeSeconds >= 900) return 'High';
  if (episodeQuality >= 0.34 || episodeSeconds >= 120) return 'Medium';
  return 'Low';
}

function mapDeepWork(summary: MachineSummaryReport): UserActivityDeepWork {
  return summary.deepWorkActive ? 'Active' : 'Not active';
}

function pressureLevel(summary: MachineSummaryReport): number {
  return summary.pressureLevel;
}

function pressureConfidence(summary: MachineSummaryReport): number {
  return summary.pressureConfidence;
}

function mapPressureConfidence(summary: MachineSummaryReport): 'Low' | 'Medium' | 'High' {
  const confidence = pressureConfidence(summary);
  if (confidence >= 0.75) return 'High';
  if (confidence >= 0.5) return 'Medium';
  return 'Low';
}

function mapOverloadRisk(summary: MachineSummaryReport): UserActivityOverloadRisk {
  const pressure = pressureLevel(summary);
  if (summary.overloadActive || pressure >= 0.72) return 'High';
  if (pressure >= 0.4) return 'Medium';
  return 'Low';
}

function mapBreakNeeded(summary: MachineSummaryReport): UserActivityBreakNeeded {
  return summary.breakNeeded || summary.breakPendingKind ? 'Yes' : 'No';
}

export function describePressureLabel(summary: MachineSummaryReport, stateStale: boolean): string {
  if (stateStale || !summary.agentRunning || !summary.userSessionConnected) {
    return 'Unavailable';
  }

  return formatPercent(pressureLevel(summary), 'Unknown');
}

export function describePressureConfidence(summary: MachineSummaryReport, stateStale: boolean): string {
  if (stateStale || !summary.agentRunning || !summary.userSessionConnected) {
    return 'Confidence unavailable';
  }

  const confidence = pressureConfidence(summary);
  if (!Number.isFinite(confidence)) {
    return 'Confidence unavailable';
  }

  return `Confidence ${mapPressureConfidence(summary)} (${formatPercent(confidence, 'Unknown')})`;
}

export function describeActivityReason(summary: MachineSummaryReport, stateStale: boolean): string | null {
  if (stateStale || !summary.agentRunning || !summary.userSessionConnected) {
    return null;
  }

  const attentionReason = typeof summary.attentionSegmentReasonText === 'string'
    ? summary.attentionSegmentReasonText.trim()
    : '';
  if (attentionReason.length > 0) {
    return attentionReason;
  }

  const focusReason = typeof summary.focusEpisodeReasonText === 'string'
    ? summary.focusEpisodeReasonText.trim()
    : '';
  return focusReason.length > 0 ? focusReason : null;
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
        const activityReason = describeActivityReason(summary, stateStale);
        const pressureLabel = describePressureLabel(summary, stateStale);
        const pressureConfidenceLabel = describePressureConfidence(summary, stateStale);
        const tone = deriveTone(summary, stateStale, note);
        const focusDurationSec = focusEpisodeSeconds(summary);

        return {
          machineId: summary.machineId,
          machineName: machineNameLabel(summary.machineName),
          userName: identityPrimaryLabel(summary.displayName, summary.userName),
          userDetail: identitySecondaryLabel(summary.displayName, summary.primaryEmail, summary.userName),
          orgRole: orgRoleLabel(summary.orgName, summary.role),
          focusLevel: tone === 'unavailable' ? 'Unavailable' : mapFocusLevel(summary),
          deepWork: tone === 'unavailable' ? 'Unavailable' : mapDeepWork(summary),
          overloadRisk: tone === 'unavailable' ? 'Unavailable' : mapOverloadRisk(summary),
          pressureLabel,
          pressureConfidenceLabel,
          focusDurationSec: tone === 'unavailable' ? null : focusDurationSec,
          focusDurationLabel: tone === 'unavailable'
            ? formatDuration(null, 'Unavailable')
            : formatDuration(focusDurationSec, 'Unknown'),
          breakNeeded: tone === 'unavailable' ? 'Unavailable' : mapBreakNeeded(summary),
          stateTimestampUtc: summary.reportedAtUtc,
          stateStale,
          note,
          activityReason,
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
