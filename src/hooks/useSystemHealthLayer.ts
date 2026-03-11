import { useMemo } from 'react';
import type { SystemHealthRecord, SystemHealthStatus, SystemHealthTone } from '../types/systemHealth';
import { formatRelativeFromNow } from '../utils/date';
import {
  deriveSystemError,
  identityPrimaryLabel,
  identitySecondaryLabel,
  isFresh,
  machineNameLabel,
  orgRoleLabel
} from '../utils/fleetTruth';
import { useMachineSummaryFeed } from './useMachineSummaryFeed';

const HEARTBEAT_FRESH_MS = 45_000;
const ACTIVITY_FRESH_MS = 2 * 60_000;

function statusClassValue(value: boolean): SystemHealthStatus {
  return value ? 'Yes' : 'No';
}

function deriveAgentRunning(summaryReportedAtUtc: string, agentRunning: boolean): SystemHealthStatus {
  if (!isFresh(summaryReportedAtUtc, HEARTBEAT_FRESH_MS)) return 'No';
  return statusClassValue(agentRunning);
}

function deriveTone(input: {
  agentRunning: SystemHealthStatus;
  userSessionConnected: SystemHealthStatus;
  activityDetected: SystemHealthStatus;
  errorMessage: string | null;
}): SystemHealthTone {
  if (input.agentRunning === 'No') return 'critical';
  if (input.errorMessage) return 'warning';
  if (input.userSessionConnected !== 'Yes') return 'warning';
  if (input.activityDetected !== 'Yes') return 'warning';
  return 'healthy';
}

export function useSystemHealthLayer(): {
  records: SystemHealthRecord[];
  loading: boolean;
  error: import('../api/client').ApiError | undefined;
  lastRefreshUtc: string | undefined;
  notices: string[];
} {
  const feed = useMachineSummaryFeed();

  const records = useMemo<SystemHealthRecord[]>(() => (
    feed.rows
      .map((summary) => {
        const lastSeenStale = !isFresh(summary.reportedAtUtc, HEARTBEAT_FRESH_MS);
        const lastActivityStale = summary.lastActivityUtc
          ? !isFresh(summary.lastActivityUtc, ACTIVITY_FRESH_MS)
          : false;
        const agentRunning = deriveAgentRunning(summary.reportedAtUtc, summary.agentRunning);
        const userSessionConnected: SystemHealthStatus = agentRunning === 'Yes'
          ? statusClassValue(summary.userSessionConnected)
          : 'No';
        const activityDetected: SystemHealthStatus = agentRunning === 'Yes' && userSessionConnected === 'Yes'
          ? statusClassValue(summary.activityDetected)
          : 'No';
        const errorMessage = deriveSystemError(summary, lastSeenStale);

        return {
          accountId: summary.accountId ?? null,
          deviceId: summary.deviceId ?? null,
          machineId: summary.machineId,
          machineName: machineNameLabel(summary.machineName),
          userName: identityPrimaryLabel(summary.displayName, summary.userName),
          userDetail: identitySecondaryLabel(summary.displayName, summary.primaryEmail, summary.userName),
          orgRole: orgRoleLabel(summary.orgName, summary.role),
          deviceStatus: summary.deviceStatus ?? null,
          deviceRevokedAt: summary.deviceRevokedAt ?? null,
          lastSeenUtc: summary.reportedAtUtc,
          lastSeenLabel: formatRelativeFromNow(summary.reportedAtUtc),
          lastSeenStale,
          agentRunning,
          userSessionConnected,
          activityDetected,
          lastActivityUtc: summary.lastActivityUtc ?? null,
          lastActivityLabel: summary.lastActivityUtc ? formatRelativeFromNow(summary.lastActivityUtc) : 'Never',
          lastActivityStale,
          errorMessage,
          tone: deriveTone({
            agentRunning,
            userSessionConnected,
            activityDetected,
            errorMessage
          })
        } satisfies SystemHealthRecord;
      })
      .sort((left, right) => {
        if (left.tone !== right.tone) {
          const rank = { critical: 0, warning: 1, healthy: 2 };
          return rank[left.tone] - rank[right.tone];
        }
        return Date.parse(right.lastSeenUtc ?? '') - Date.parse(left.lastSeenUtc ?? '');
      })
  ), [feed.rows]);

  const notices = useMemo(() => {
    if (feed.loading || feed.error) return [];
    if (feed.rows.length === 0) {
      return ['The control plane returned zero machine rows from /v1/machines/summary.'];
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
