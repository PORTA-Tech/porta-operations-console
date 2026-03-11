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

  const ownershipWarning = describeOwnershipWarning(summary.ownershipWarning);
  if (ownershipWarning) return ownershipWarning;

  const captureFailure = describeCaptureFailureReason(summary.captureFailureReason);
  if (captureFailure) return captureFailure;

  if (summary.captureContext === 'ServiceSession') {
    return 'PORTA is not attached to the active user session';
  }

  const normalizedError = normalizeErrorMessage(summary.lastError);
  if (normalizedError) return normalizedError;

  if (lastSeenStale) return 'Machine summary stale';
  if (!summary.agentRunning) return 'Agent is not running';
  return null;
}
