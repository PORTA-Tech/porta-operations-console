import { useEffect, useMemo, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { getNodeSnapshot, type NodeSnapshotRow } from '../api/nodes';
import { fetchAlerts, fetchAuditDecisions } from '../api/operations';
import type { AlertRecord, AuditDecisionRecord } from '../types/consoleOperations';
import type { SystemHealthRecord, SystemHealthStatus, SystemHealthTone } from '../types/systemHealth';
import { formatRelativeFromNow } from '../utils/date';

const HEARTBEAT_FRESH_MS = 45_000;
const STATE_FRESH_MS = 2 * 60_000;
const SESSION_FRESH_MS = 2 * 60_000;
const ACTIVITY_FRESH_MS = 2 * 60_000;
const HEALTH_ALERT_TYPES = new Set(['agent_offline', 'backend_disconnected']);

interface StreamHealthState {
  machineId: string;
  machineName: string | null;
  userName: string | null;
  timestampUtc: string;
  lastSeenUtc: string | null;
  agentRunning: boolean | null;
  sessionConnected: boolean | null;
  activityDetected: boolean | null;
  lastActivityUtc: string | null;
  userAgentHeartbeatUtc: string | null;
  userAgentSessionId: string | null;
  captureContext: string | null;
  keyboardSignalActive: boolean | null;
  mouseSignalActive: boolean | null;
  backendConnected: boolean | null;
  localApiAuthReady: boolean | null;
  dbMigrationFailed: boolean | null;
  captureFailureReason: string | null;
  ownershipWarning: string | null;
  lastError: string | null;
}

interface TraceHealthState {
  machineId: string;
  machineName: string | null;
  userName: string | null;
  timestampUtc: string | null;
  sessionConnected: boolean | null;
  activityDetected: boolean | null;
  lastActivityUtc: string | null;
  userAgentHeartbeatUtc: string | null;
  userAgentSessionId: string | null;
  captureContext: string | null;
  keyboardSignalActive: boolean | null;
  mouseSignalActive: boolean | null;
  backendConnected: boolean | null;
  localApiAuthReady: boolean | null;
  dbMigrationFailed: boolean | null;
  captureFailureReason: string | null;
  ownershipWarning: string | null;
  lastError: string | null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = parseString(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function pickBoolean(record: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = parseBoolean(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function pickStringFromRecords(records: Array<Record<string, unknown>>, keys: string[]): string | null {
  for (const record of records) {
    const value = pickString(record, keys);
    if (value !== null) return value;
  }
  return null;
}

function pickBooleanFromRecords(records: Array<Record<string, unknown>>, keys: string[]): boolean | null {
  for (const record of records) {
    const value = pickBoolean(record, keys);
    if (value !== null) return value;
  }
  return null;
}

function readSegmentPayload(raw: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const candidate = toRecord(raw[key]);
    if (Object.keys(candidate).length > 0) return candidate;
  }
  return {};
}

function toWsBase(base: string): string {
  const trimmed = base.trim().replace(/\/$/, '');
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed;
  if (trimmed.startsWith('https://')) return `wss://${trimmed.slice('https://'.length)}`;
  if (trimmed.startsWith('http://')) return `ws://${trimmed.slice('http://'.length)}`;
  return `ws://${trimmed}`;
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function newestTimestamp(values: Array<string | null | undefined>): string | null {
  let newest: string | null = null;
  let newestMs = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    const parsed = parseTimestamp(value ?? null);
    if (parsed === null || parsed <= newestMs) continue;
    newestMs = parsed;
    newest = value ?? null;
  }

  return newest;
}

function isFresh(value: string | null | undefined, freshnessWindowMs: number): boolean {
  const parsed = parseTimestamp(value ?? null);
  return parsed !== null && (Date.now() - parsed) <= freshnessWindowMs;
}

function normalizeErrorMessage(value: string | null): string | null {
  if (!value) return null;
  const firstLine = value
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return null;
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

function normalizeCaptureContext(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/[\s_-]+/g, '').toLowerCase();
}

function isUserSessionContext(value: string | null): boolean {
  return normalizeCaptureContext(value) === 'usersession';
}

function isNonUserSessionContext(value: string | null): boolean {
  const normalized = normalizeCaptureContext(value);
  return normalized !== null && normalized !== 'usersession';
}

function describeCaptureFailureReason(value: string | null): string | null {
  if (!value) return null;
  return value.trim() === 'CAPTURE_CONTEXT_SERVICE_SESSION'
    ? 'capture is running in a service session'
    : value.trim() === 'CAPTURE_CONTEXT_UNKNOWN'
      ? 'user-session capture is not available'
      : null;
}

function describeOwnershipWarning(input: { ownershipWarning: string | null; userAgentSessionId: string | null }): string | null {
  if (!input.ownershipWarning) return null;

  return input.ownershipWarning.trim() === 'USER_AGENT_HEARTBEAT_MISSING'
    ? 'last input owner has no fresh user-agent heartbeat'
    : input.ownershipWarning.trim() === 'USER_AGENT_INSTANCE_MISMATCH'
      ? 'heartbeat owner does not match the last input owner'
      : input.ownershipWarning.trim() === 'USER_AGENT_SESSION_MISMATCH'
        ? `heartbeat session ${input.userAgentSessionId ?? 'unknown'} does not match the last input session`
        : null;
}

function operationalErrorText(value: string | null): string | null {
  const normalized = normalizeErrorMessage(value);
  if (!normalized) return null;

  const keywordMatch = /(capture|session|heartbeat|input|keyboard|mouse|signal|backend|auth|token|migration|local api|ownership|disconnect|stale)/i;
  return keywordMatch.test(normalized) ? normalized : null;
}

function deriveStructuredOperationalError(input: {
  dbMigrationFailed: boolean | null;
  localApiAuthReady: boolean | null;
  backendConnected: boolean | null;
  captureFailureReason: string | null;
  ownershipWarning: string | null;
  userAgentSessionId: string | null;
  captureContext: string | null;
  lastError: string | null;
}): string | null {
  if (input.dbMigrationFailed === true) return 'Database migration failed';
  if (input.localApiAuthReady === false) return 'Local API auth not ready';
  if (input.backendConnected === false) return 'Backend disconnected';

  const ownershipDetail = describeOwnershipWarning({
    ownershipWarning: input.ownershipWarning,
    userAgentSessionId: input.userAgentSessionId
  });
  if (ownershipDetail) return `Ownership mismatch: ${ownershipDetail}`;

  const captureFailureDetail = describeCaptureFailureReason(input.captureFailureReason);
  if (captureFailureDetail) return `Not collecting: ${captureFailureDetail}`;

  if (isNonUserSessionContext(input.captureContext)) {
    return 'PORTA is not attached to the active user session';
  }

  return operationalErrorText(input.lastError);
}

function captureHealthDegraded(input: {
  localApiAuthReady: boolean | null;
  dbMigrationFailed: boolean | null;
  captureFailureReason: string | null;
  ownershipWarning: string | null;
  lastError: string | null;
}): boolean {
  if (input.localApiAuthReady === false || input.dbMigrationFailed === true) return true;
  if (input.captureFailureReason !== null || input.ownershipWarning !== null) return true;

  const normalized = operationalErrorText(input.lastError);
  return normalized !== null && /(capture|session|input|keyboard|mouse|signal|auth|migration|ownership)/i.test(normalized);
}

function machineNameLabel(value: string | null): string {
  return value ?? 'Unknown machine';
}

function userNameLabel(value: string | null): string {
  return value ?? 'Unknown user';
}

function timeLabel(value: string | null, fallback: 'Unknown' | 'Never'): string {
  return value ? formatRelativeFromNow(value) : fallback;
}

function toneRank(value: SystemHealthTone): number {
  if (value === 'critical') return 0;
  if (value === 'warning') return 1;
  return 2;
}

function parseStreamHealthState(payload: Record<string, unknown>): StreamHealthState | null {
  const machineId = pickString(payload, ['machine_id', 'machineId', 'agent_id', 'node_id']);
  if (!machineId) return null;

  const statusPayload = readSegmentPayload(payload, ['status', 'runtime', 'runtime_status', 'system', 'system_health', 'health']);
  const signalPayload = readSegmentPayload(payload, ['signal', 'signals', 'signal_snapshot', 'inputs']);
  const statePayload = readSegmentPayload(payload, ['state', 'state_snapshot']);
  const records = [payload, statusPayload, signalPayload, statePayload];
  const timestampUtc = pickString(payload, ['timestamp', 'timestamp_utc', 'at_utc']) ?? new Date().toISOString();

  return {
    machineId,
    machineName: pickStringFromRecords(records, ['machine_name', 'machineName', 'hostname', 'device_name']),
    userName: pickStringFromRecords(records, [
      'user_name',
      'userName',
      'username',
      'session_user',
      'session_user_name',
      'active_user_name',
      'display_name'
    ]),
    timestampUtc,
    lastSeenUtc: newestTimestamp([
      pickStringFromRecords(records, ['last_seen_utc', 'lastSeenUtc', 'last_heartbeat', 'lastHeartbeatUtc', 'last_updated_utc', 'lastUpdatedUtc']),
      timestampUtc
    ]),
    agentRunning: pickBooleanFromRecords(records, ['agent_running', 'agentRunning', 'service_running', 'serviceRunning']),
    sessionConnected: pickBooleanFromRecords(records, ['user_session_connected', 'session_connected', 'sessionConnected']),
    activityDetected: pickBooleanFromRecords(records, ['activity_detected', 'activityDetected']),
    lastActivityUtc: newestTimestamp([
      pickStringFromRecords(records, ['last_activity_utc', 'lastActivityUtc', 'last_input_event_utc', 'lastInputEventUtc'])
    ]),
    userAgentHeartbeatUtc: pickStringFromRecords(records, ['user_agent_heartbeat_utc', 'userAgentHeartbeatUtc']),
    userAgentSessionId: pickStringFromRecords(records, ['user_agent_session_id', 'userAgentSessionId']),
    captureContext: pickStringFromRecords(records, ['capture_context', 'captureContext']),
    keyboardSignalActive: pickBooleanFromRecords(records, ['keyboard_signal_active', 'keyboardSignalActive']),
    mouseSignalActive: pickBooleanFromRecords(records, ['mouse_signal_active', 'mouseSignalActive']),
    backendConnected: pickBooleanFromRecords(records, ['backend_connected', 'backendConnected']),
    localApiAuthReady: pickBooleanFromRecords(records, ['local_api_auth_ready', 'localApiAuthReady']),
    dbMigrationFailed: pickBooleanFromRecords(records, ['db_migration_failed', 'dbMigrationFailed']),
    captureFailureReason: pickStringFromRecords(records, ['capture_failure_reason', 'captureFailureReason']),
    ownershipWarning: pickStringFromRecords(records, ['ownership_warning', 'ownershipWarning']),
    lastError: pickStringFromRecords(records, ['last_error', 'lastError', 'error_message', 'error', 'failure_reason'])
  };
}

function machineIdFromTrace(row: AuditDecisionRecord): string | null {
  const machineId = (row.machine_id ?? '').trim();
  if (machineId.length > 0) return machineId;
  const agentId = row.agent_id.trim();
  return agentId.length > 0 ? agentId : null;
}

function traceHealthState(row: AuditDecisionRecord): TraceHealthState | null {
  const machineId = machineIdFromTrace(row);
  if (!machineId) return null;

  const raw = toRecord(row.raw_trace);
  const statusPayload = readSegmentPayload(raw, ['status', 'runtime', 'runtime_status', 'system', 'system_health', 'health']);
  const statePayload = readSegmentPayload(raw, ['state', 'state_snapshot']);
  const signalPayload = readSegmentPayload(raw, ['signal', 'signals', 'signal_snapshot', 'inputs']);
  const records = [statusPayload, signalPayload, statePayload, raw];

  return {
    machineId,
    machineName: pickStringFromRecords(records, ['machine_name', 'machineName', 'hostname', 'device_name']),
    userName: pickStringFromRecords(records, [
      'user_name',
      'userName',
      'username',
      'session_user',
      'session_user_name',
      'active_user_name',
      'display_name'
    ]),
    timestampUtc: newestTimestamp([
      pickStringFromRecords(records, ['timestamp', 'timestamp_utc', 'occurred_at_utc', 'last_updated_utc', 'lastUpdatedUtc']),
      row.timestamp
    ]),
    sessionConnected: pickBooleanFromRecords(records, ['user_session_connected', 'session_connected', 'sessionConnected']),
    activityDetected: pickBooleanFromRecords(records, ['activity_detected', 'activityDetected']),
    lastActivityUtc: newestTimestamp([
      pickStringFromRecords(records, ['last_activity_utc', 'lastActivityUtc', 'last_input_event_utc', 'lastInputEventUtc'])
    ]),
    userAgentHeartbeatUtc: pickStringFromRecords(records, ['user_agent_heartbeat_utc', 'userAgentHeartbeatUtc']),
    userAgentSessionId: pickStringFromRecords(records, ['user_agent_session_id', 'userAgentSessionId']),
    captureContext: pickStringFromRecords(records, ['capture_context', 'captureContext']),
    keyboardSignalActive: pickBooleanFromRecords(records, ['keyboard_signal_active', 'keyboardSignalActive']),
    mouseSignalActive: pickBooleanFromRecords(records, ['mouse_signal_active', 'mouseSignalActive']),
    backendConnected: pickBooleanFromRecords(records, ['backend_connected', 'backendConnected']),
    localApiAuthReady: pickBooleanFromRecords(records, ['local_api_auth_ready', 'localApiAuthReady']),
    dbMigrationFailed: pickBooleanFromRecords(records, ['db_migration_failed', 'dbMigrationFailed']),
    captureFailureReason: pickStringFromRecords(records, ['capture_failure_reason', 'captureFailureReason']),
    ownershipWarning: pickStringFromRecords(records, ['ownership_warning', 'ownershipWarning']),
    lastError: pickStringFromRecords(records, ['last_error', 'lastError', 'error_message', 'error', 'failure_reason'])
  };
}

function relevantHealthAlert(alert: AlertRecord): boolean {
  return alert.status === 'active' && HEALTH_ALERT_TYPES.has(alert.alert_type);
}

function pickMachineIdFromAlert(alert: AlertRecord, knownIds: Set<string>): string | null {
  const raw = alert as unknown as Record<string, unknown>;
  const explicit = [
    parseString(raw.machine_id),
    parseString(raw.machineId),
    parseString(raw.agent_id),
    parseString(raw.agentId),
    parseString(raw.node_id),
    parseString(raw.nodeId)
  ];

  for (const candidate of explicit) {
    if (candidate) return candidate;
  }

  const targetService = parseString(raw.target_service) ?? parseString(alert.target_service);
  if (targetService && knownIds.has(targetService)) return targetService;
  if (targetService && /^(?:machine|node|agent)[-_:][a-z0-9._:-]+$/i.test(targetService)) return targetService;

  const reasonToken = alert.reason.match(/\b(?:machine|node|agent)[-_:][A-Za-z0-9._:-]+\b/i)?.[0] ?? null;
  if (reasonToken) return reasonToken;

  const genericToken = alert.reason.match(/\b[0-9a-f-]{8,}\b/i)?.[0] ?? null;
  return genericToken && knownIds.has(genericToken) ? genericToken : null;
}

function alertErrorMessage(alerts: AlertRecord[]): string | null {
  if (alerts.length === 0) return null;
  const sorted = [...alerts].sort((left, right) => Date.parse(right.last_seen_at) - Date.parse(left.last_seen_at));
  const latest = sorted[0];
  if (!latest) return null;

  const normalizedReason = normalizeErrorMessage(latest.reason);
  if (normalizedReason) return normalizedReason;
  if (latest.alert_type === 'agent_offline') return 'Agent disconnected';
  if (latest.alert_type === 'backend_disconnected') return 'Backend disconnected';
  return null;
}

function deriveAgentRunning(input: {
  explicitAgentRunning: boolean | null;
  lastSeenUtc: string | null;
  alerts: AlertRecord[];
}): SystemHealthStatus {
  if (input.explicitAgentRunning === false) return 'No';
  if (input.alerts.some((alert) => alert.alert_type === 'agent_offline' || alert.alert_type === 'backend_disconnected')) {
    return 'No';
  }
  if (isFresh(input.lastSeenUtc, HEARTBEAT_FRESH_MS)) return 'Yes';
  if (input.lastSeenUtc) return 'No';
  return 'Unavailable';
}

function deriveUserSessionConnected(input: {
  agentRunning: SystemHealthStatus;
  explicitSessionConnected: boolean | null;
  captureContext: string | null;
  userAgentHeartbeatUtc: string | null;
  userAgentSessionId: string | null;
}): SystemHealthStatus {
  if (input.agentRunning !== 'Yes') return 'No';
  if (input.explicitSessionConnected === true) return 'Yes';
  if (input.explicitSessionConnected === false) return 'No';
  if (isNonUserSessionContext(input.captureContext)) return 'No';
  if (
    isUserSessionContext(input.captureContext)
    && (isFresh(input.userAgentHeartbeatUtc, SESSION_FRESH_MS) || input.userAgentSessionId !== null)
  ) {
    return 'Yes';
  }
  return 'Unavailable';
}

function deriveActivityDetected(input: {
  agentRunning: SystemHealthStatus;
  userSessionConnected: SystemHealthStatus;
  explicitActivityDetected: boolean | null;
  lastActivityUtc: string | null;
  keyboardSignalActive: boolean | null;
  mouseSignalActive: boolean | null;
  captureDegraded: boolean;
}): SystemHealthStatus {
  if (input.agentRunning !== 'Yes') return 'No';
  if (input.userSessionConnected === 'No') return 'No';
  if (input.explicitActivityDetected === true) return 'Yes';
  if (input.explicitActivityDetected === false) return 'No';
  if (input.captureDegraded) return 'No';
  if (input.keyboardSignalActive === true || input.mouseSignalActive === true) return 'Yes';
  if (isFresh(input.lastActivityUtc, ACTIVITY_FRESH_MS)) return 'Yes';
  if (input.lastActivityUtc) return 'No';
  if (input.keyboardSignalActive === false && input.mouseSignalActive === false) return 'No';
  return 'Unavailable';
}

function deriveErrorMessage(input: {
  structuredError: string | null;
  alerts: AlertRecord[];
  agentRunning: SystemHealthStatus;
  lastSeenUtc: string | null;
  userSessionConnected: SystemHealthStatus;
  captureContext: string | null;
  userAgentHeartbeatUtc: string | null;
}): string | null {
  if (input.structuredError) return input.structuredError;

  const alertMessage = alertErrorMessage(input.alerts);
  if (alertMessage) return alertMessage;

  if (input.agentRunning === 'No') {
    if (input.lastSeenUtc && !isFresh(input.lastSeenUtc, HEARTBEAT_FRESH_MS)) {
      return 'Heartbeat stale';
    }
    return 'No recent agent heartbeat';
  }

  if (
    input.userSessionConnected === 'No'
    && isUserSessionContext(input.captureContext)
    && !isFresh(input.userAgentHeartbeatUtc, SESSION_FRESH_MS)
  ) {
    return 'No recent user-agent heartbeat from the interactive session';
  }

  return null;
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
  error: ApiError | undefined;
  lastRefreshUtc: string | undefined;
  notices: string[];
} {
  const [snapshotRows, setSnapshotRows] = useState<NodeSnapshotRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditDecisionRecord[]>([]);
  const [alertRows, setAlertRows] = useState<AlertRecord[]>([]);
  const [streamRows, setStreamRows] = useState<Record<string, StreamHealthState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [lastRefreshUtc, setLastRefreshUtc] = useState<string | undefined>(undefined);
  const [notices, setNotices] = useState<string[]>([]);
  const wsBase = import.meta.env.VITE_WS_BASE_URL?.trim();

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      const [snapshotResult, auditResult, alertResult] = await Promise.allSettled([
        getNodeSnapshot(),
        fetchAuditDecisions({ throwOnError: true }),
        fetchAlerts(true, { throwOnError: true })
      ]);
      const nextNotices: string[] = [];

      if (!mounted) return;

      if (snapshotResult.status === 'fulfilled') {
        setSnapshotRows(snapshotResult.value);
        setError(undefined);
        if (snapshotResult.value.length === 0) {
          nextNotices.push('The control plane returned zero machine rows from the node snapshot feed.');
        }
      } else {
        setSnapshotRows([]);
        setError(toApiError(snapshotResult.reason));
      }

      if (auditResult.status === 'fulfilled') {
        setAuditRows(auditResult.value);
      } else {
        setAuditRows([]);
        nextNotices.push(`Decision trace feed unavailable: ${toApiError(auditResult.reason).message}`);
      }

      if (alertResult.status === 'fulfilled') {
        setAlertRows(alertResult.value.filter(relevantHealthAlert));
      } else {
        setAlertRows([]);
        nextNotices.push(`Health alert feed unavailable: ${toApiError(alertResult.reason).message}`);
      }

      setNotices(nextNotices);
      setLastRefreshUtc(new Date().toISOString());
      setLoading(false);
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5_000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!wsBase) return () => undefined;

    let disposed = false;
    let reconnectTimer: number | undefined;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (disposed) return;

      let streamUrl: string;
      try {
        streamUrl = `${toWsBase(wsBase)}/v1/stream/console-state`;
        new URL(streamUrl);
      } catch {
        return;
      }

      socket = new WebSocket(streamUrl);

      socket.onmessage = (event) => {
        if (disposed) return;

        try {
          const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
          const parsed = parseStreamHealthState(payload);
          if (!parsed) return;
          setStreamRows((current) => ({
            ...current,
            [parsed.machineId]: parsed
          }));
        } catch {
          // Ignore malformed realtime payloads; snapshot state remains authoritative.
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        reconnectTimer = window.setTimeout(connect, 5_000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [wsBase]);

  const records = useMemo<SystemHealthRecord[]>(() => {
    const snapshotByMachine = new Map<string, NodeSnapshotRow>();
    for (const row of snapshotRows) {
      snapshotByMachine.set(row.node_id, row);
    }

    const traceByMachine = new Map<string, TraceHealthState>();
    for (const row of auditRows) {
      const parsed = traceHealthState(row);
      if (!parsed?.machineId) continue;

      const current = traceByMachine.get(parsed.machineId);
      const currentMs = parseTimestamp(current?.timestampUtc ?? null) ?? Number.NEGATIVE_INFINITY;
      const nextMs = parseTimestamp(parsed.timestampUtc) ?? Number.NEGATIVE_INFINITY;
      if (nextMs > currentMs) {
        traceByMachine.set(parsed.machineId, parsed);
      }
    }

    const machineIds = new Set<string>([
      ...snapshotByMachine.keys(),
      ...Object.keys(streamRows)
    ]);

    const alertsByMachine = new Map<string, AlertRecord[]>();
    for (const alert of alertRows) {
      const machineId = pickMachineIdFromAlert(alert, machineIds);
      if (!machineId) continue;
      machineIds.add(machineId);
      const bucket = alertsByMachine.get(machineId) ?? [];
      bucket.push(alert);
      alertsByMachine.set(machineId, bucket);
    }

    return [...machineIds]
      .map((machineId) => {
        const snapshot = snapshotByMachine.get(machineId);
        const streamState = streamRows[machineId];
        const traceState = traceByMachine.get(machineId);
        const alerts = alertsByMachine.get(machineId) ?? [];

        const lastSeenUtc = newestTimestamp([
          snapshot?.last_heartbeat,
          streamState?.lastSeenUtc,
          streamState?.timestampUtc
        ]);
        const lastActivityUtc = newestTimestamp([
          streamState?.lastActivityUtc,
          isFresh(traceState?.timestampUtc, STATE_FRESH_MS) ? traceState?.lastActivityUtc : null
        ]);

        const explicitAgentRunning = isFresh(streamState?.timestampUtc, STATE_FRESH_MS)
          ? streamState?.agentRunning ?? null
          : null;
        const explicitSessionConnected = isFresh(streamState?.timestampUtc, STATE_FRESH_MS)
          ? streamState?.sessionConnected ?? null
          : isFresh(traceState?.timestampUtc, STATE_FRESH_MS)
            ? traceState?.sessionConnected ?? null
            : null;
        const explicitActivityDetected = isFresh(streamState?.timestampUtc, STATE_FRESH_MS)
          ? streamState?.activityDetected ?? null
          : isFresh(traceState?.timestampUtc, STATE_FRESH_MS)
            ? traceState?.activityDetected ?? null
            : null;
        const freshStreamState = isFresh(streamState?.timestampUtc, STATE_FRESH_MS) ? streamState : null;
        const freshTraceState = isFresh(traceState?.timestampUtc, STATE_FRESH_MS) ? traceState : null;
        const captureContext = freshStreamState?.captureContext ?? freshTraceState?.captureContext ?? null;
        const userAgentHeartbeatUtc = freshStreamState?.userAgentHeartbeatUtc ?? freshTraceState?.userAgentHeartbeatUtc ?? null;
        const userAgentSessionId = freshStreamState?.userAgentSessionId ?? freshTraceState?.userAgentSessionId ?? null;
        const keyboardSignalActive = freshStreamState?.keyboardSignalActive ?? freshTraceState?.keyboardSignalActive ?? null;
        const mouseSignalActive = freshStreamState?.mouseSignalActive ?? freshTraceState?.mouseSignalActive ?? null;
        const structuredError = deriveStructuredOperationalError({
          dbMigrationFailed: freshStreamState?.dbMigrationFailed ?? freshTraceState?.dbMigrationFailed ?? null,
          localApiAuthReady: freshStreamState?.localApiAuthReady ?? freshTraceState?.localApiAuthReady ?? null,
          backendConnected: freshStreamState?.backendConnected ?? freshTraceState?.backendConnected ?? null,
          captureFailureReason: freshStreamState?.captureFailureReason ?? freshTraceState?.captureFailureReason ?? null,
          ownershipWarning: freshStreamState?.ownershipWarning ?? freshTraceState?.ownershipWarning ?? null,
          userAgentSessionId,
          captureContext,
          lastError: freshStreamState?.lastError ?? freshTraceState?.lastError ?? null
        });
        const captureDegraded = captureHealthDegraded({
          localApiAuthReady: freshStreamState?.localApiAuthReady ?? freshTraceState?.localApiAuthReady ?? null,
          dbMigrationFailed: freshStreamState?.dbMigrationFailed ?? freshTraceState?.dbMigrationFailed ?? null,
          captureFailureReason: freshStreamState?.captureFailureReason ?? freshTraceState?.captureFailureReason ?? null,
          ownershipWarning: freshStreamState?.ownershipWarning ?? freshTraceState?.ownershipWarning ?? null,
          lastError: freshStreamState?.lastError ?? freshTraceState?.lastError ?? null
        });

        const agentRunning = deriveAgentRunning({
          explicitAgentRunning,
          lastSeenUtc,
          alerts
        });
        const userSessionConnected = deriveUserSessionConnected({
          agentRunning,
          explicitSessionConnected,
          captureContext,
          userAgentHeartbeatUtc,
          userAgentSessionId
        });
        const activityDetected = deriveActivityDetected({
          agentRunning,
          userSessionConnected,
          explicitActivityDetected,
          lastActivityUtc,
          keyboardSignalActive,
          mouseSignalActive,
          captureDegraded
        });
        const errorMessage = deriveErrorMessage({
          structuredError,
          alerts,
          agentRunning,
          lastSeenUtc,
          userSessionConnected,
          captureContext,
          userAgentHeartbeatUtc
        });
        const tone = deriveTone({
          agentRunning,
          userSessionConnected,
          activityDetected,
          errorMessage
        });

        return {
          machineId,
          machineName: machineNameLabel(streamState?.machineName ?? traceState?.machineName ?? null),
          userName: userNameLabel(
            freshStreamState?.userName
              ?? freshTraceState?.userName
              ?? null
          ),
          lastSeenUtc,
          lastSeenLabel: timeLabel(lastSeenUtc, 'Unknown'),
          lastSeenStale: lastSeenUtc !== null && !isFresh(lastSeenUtc, HEARTBEAT_FRESH_MS),
          agentRunning,
          userSessionConnected,
          activityDetected,
          lastActivityUtc,
          lastActivityLabel: timeLabel(
            lastActivityUtc,
            userSessionConnected === 'Yes' && activityDetected === 'No' ? 'Never' : 'Unknown'
          ),
          lastActivityStale: lastActivityUtc !== null && !isFresh(lastActivityUtc, ACTIVITY_FRESH_MS),
          errorMessage,
          tone
        } satisfies SystemHealthRecord;
      })
      .sort((left, right) => {
        const toneDelta = toneRank(left.tone) - toneRank(right.tone);
        if (toneDelta !== 0) return toneDelta;
        return (parseTimestamp(right.lastSeenUtc) ?? 0) - (parseTimestamp(left.lastSeenUtc) ?? 0);
      });
  }, [alertRows, auditRows, snapshotRows, streamRows]);

  return useMemo(
    () => ({
      records,
      loading,
      error,
      lastRefreshUtc,
      notices
    }),
    [error, lastRefreshUtc, loading, notices, records]
  );
}
