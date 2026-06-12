import type { MachineSummaryReport } from '../api/machines';

export function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isFresh(value: string | null | undefined, freshnessWindowMs: number): boolean {
  const parsed = parseTimestamp(value);
  return parsed !== null && (Date.now() - parsed) <= freshnessWindowMs;
}

export function machineNameLabel(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value.trim() : 'Unknown machine';
}

export function userNameLabel(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value.trim() : 'Unknown user';
}

export function identityPrimaryLabel(displayName: string | null | undefined, fallbackUserName: string | null | undefined): string {
  return displayName && displayName.trim().length > 0 ? displayName.trim() : userNameLabel(fallbackUserName);
}

export function identitySecondaryLabel(
  displayName: string | null | undefined,
  primaryEmail: string | null | undefined,
  fallbackUserName: string | null | undefined
): string | null {
  if (primaryEmail && primaryEmail.trim().length > 0) {
    return primaryEmail.trim();
  }

  const fallback = userNameLabel(fallbackUserName);
  if (displayName && displayName.trim().length > 0 && displayName.trim() !== fallback) {
    return fallback;
  }

  return null;
}

export function orgRoleLabel(orgName: string | null | undefined, role: string | null | undefined): string | null {
  const trimmedOrg = orgName?.trim();
  const trimmedRole = role?.trim();

  if (trimmedOrg && trimmedRole) {
    return `${trimmedOrg} / ${capitalize(trimmedRole)}`;
  }

  if (trimmedOrg) {
    return trimmedOrg;
  }

  if (trimmedRole) {
    return capitalize(trimmedRole);
  }

  return null;
}

export function formatMissingChannels(channels: string[]): string {
  return channels
    .map((channel) => channel.trim())
    .filter((channel) => channel.length > 0)
    .map((channel) => channel.charAt(0).toUpperCase() + channel.slice(1))
    .join(', ');
}

function normalizeErrorMessage(value: string | null | undefined): string | null {
  if (!value) return null;
  const firstLine = value
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return null;
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

function prettyCode(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

export function describeCaptureFailureReason(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim() === 'CAPTURE_CONTEXT_SERVICE_SESSION'
    ? 'Capture is running in a service session'
    : value.trim() === 'CAPTURE_CONTEXT_UNKNOWN'
      ? 'User-session capture is not available'
      : value.trim() === 'USER_AGENT_NEVER_STARTED'
        ? 'User agent never started in the interactive session'
        : value.trim() === 'USER_AGENT_HEARTBEAT_STALE'
          ? 'User-agent heartbeat stopped updating'
          : value.trim() === 'USER_AGENT_SESSION_SWITCHED'
            ? 'Heartbeat belongs to a different Windows session'
      : prettyCode(value);
}

export function describeOwnershipWarning(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim() === 'USER_AGENT_HEARTBEAT_MISSING'
    ? 'Last input owner has no fresh user-agent heartbeat'
    : value.trim() === 'USER_AGENT_INSTANCE_MISMATCH'
      ? 'Heartbeat owner does not match the last input owner'
      : value.trim() === 'USER_AGENT_SESSION_MISMATCH'
        ? 'Heartbeat session does not match the last input session'
        : prettyCode(value);
}

export function deriveSystemError(summary: MachineSummaryReport, lastSeenStale: boolean): string | null {
  if (summary.dbMigrationFailed) return 'Database migration failed';
  if (!summary.localApiAuthReady) return 'Local API auth not ready';
  if (!summary.backendConnected) return 'Backend disconnected';
  if (lastSeenStale) return 'Machine summary stale';
  if (!summary.agentRunning) return 'Agent is not running';

  const ownershipWarning = describeOwnershipWarning(summary.ownershipWarning);
  if (ownershipWarning) return ownershipWarning;

  const captureFailure = describeCaptureFailureReason(summary.captureFailureReason);
  if (captureFailure) return captureFailure;

  if (summary.captureContext === 'ServiceSession') {
    return 'PORTA is not attached to the active user session';
  }

  const normalizedError = normalizeErrorMessage(summary.lastError);
  if (normalizedError) return normalizedError;
  return null;
}

// ─── Fleet classification ─────────────────────────────────────────────────────
// Single source of truth for the System Health tiles and the sidebar counters.
// Every machine lands in EXACTLY ONE bucket, so tile counts always sum to the
// machine count. Priority: disconnected → degraded → healthy.

export type MachinePresence = 'online' | 'recent' | 'offline';
export type FleetBucket = 'healthy' | 'degraded' | 'disconnected';

/**
 * Liveness comes from the server-derived presence field; deviceStatus only
 * means the device credential is not revoked. Older control planes lack
 * presence, so we fall back to agentRunning from the last report.
 */
export function machinePresence(row: MachineSummaryReport): MachinePresence {
  return row.presence ?? (row.agentRunning ? 'online' : 'offline');
}

/**
 * Why a connected machine is not capturing cleanly. Empty array = clean.
 * This is the ONLY place degradation rules live; the tiles must not add
 * their own conditions on top.
 */
export function captureDegradationReasons(row: MachineSummaryReport): string[] {
  const reasons: string[] = [];
  if (row.partialData === true) reasons.push('Partial data');
  if ((row.missingMajorChannels?.length ?? 0) > 0) {
    reasons.push(`Missing channels: ${formatMissingChannels(row.missingMajorChannels)}`);
  }
  if (row.selfTestEffective === 'stale_pending') reasons.push('Self-test stuck (no input)');
  if (row.hasInputData === false) reasons.push('No input ever captured');
  if (!row.userSessionConnected) reasons.push('No user session attached');
  if (row.lastError) reasons.push('Agent reported an error');
  return reasons;
}

/**
 * Exclusive, exhaustive bucket per machine.
 * A RECENT machine (seen within the recent window) with no degradation flags
 * counts as healthy — being between heartbeats is not a problem.
 */
export function classifyMachine(row: MachineSummaryReport): FleetBucket {
  if (machinePresence(row) === 'offline') return 'disconnected';
  return captureDegradationReasons(row).length > 0 ? 'degraded' : 'healthy';
}

/**
 * "Active now" must never count a machine that is offline: activityDetected
 * is a flag from the machine's LAST report and goes stale the moment the
 * agent stops reporting.
 */
export function isActiveNow(row: MachineSummaryReport): boolean {
  return machinePresence(row) !== 'offline' && row.activityDetected;
}

/**
 * Overlay metric (not a bucket): connected machines producing no input.
 * Overlaps with degraded by design — it answers a different question.
 */
export function hasNoLiveActivity(row: MachineSummaryReport): boolean {
  return machinePresence(row) !== 'offline'
    && (row.hasInputData === false || (row.hasInputData === undefined && !row.activityDetected));
}
