import { useEffect, useMemo, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { getNodeSnapshot, type NodeSnapshotRow } from '../api/nodes';
import { fetchAlerts, fetchAuditDecisions } from '../api/operations';
import type { AlertRecord, AuditDecisionRecord } from '../types/consoleOperations';
import type { SystemHealthRecord, SystemHealthStatus, SystemHealthTone } from '../types/systemHealth';
import { formatRelativeFromNow } from '../utils/date';

const HEARTBEAT_FRESH_MS = 45_000;
const STATE_FRESH_MS = 2 * 60_000;
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
  errorMessage: string | null;
}

interface TraceHealthState {
  machineId: string;
  machineName: string | null;
  userName: string | null;
  timestampUtc: string | null;
  sessionConnected: boolean | null;
  activityDetected: boolean | null;
  lastActivityUtc: string | null;
  errorMessage: string | null;
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

function machineNameLabel(value: string | null): string {
  return value ?? 'Unknown machine';
}

function userNameLabel(value: string | null): string {
  return value ?? 'Unknown user';
}

function timeLabel(value: string | null, fallback: 'Unknown' | 'Never'): string {
  return value ? formatRelativeFromNow(value) : fallback;
}

function userSessionError(value: string | null): boolean {
  const normalized = value?.toLowerCase() ?? '';
  return normalized.includes('service session')
    || normalized.includes('no user session')
    || normalized.includes('no active session')
    || normalized.includes('session not connected');
}

function captureError(value: string | null): boolean {
  const normalized = value?.toLowerCase() ?? '';
  return normalized.includes('capture')
    || normalized.includes('input')
    || normalized.includes('keyboard')
    || normalized.includes('mouse')
    || normalized.includes('activity packet')
    || normalized.includes('signal ingest');
}

function toneRank(value: SystemHealthTone): number {
  if (value === 'critical') return 0;
  if (value === 'warning') return 1;
  return 2;
}

function parseStreamHealthState(payload: Record<string, unknown>): StreamHealthState | null {
  const machineId = pickString(payload, ['machine_id', 'machineId', 'agent_id', 'node_id']);
  if (!machineId) return null;

  const signalPayload = toRecord(payload.signal ?? payload.signals ?? payload.signal_snapshot ?? payload.inputs);
  const timestampUtc = pickString(payload, ['timestamp', 'timestamp_utc', 'at_utc']) ?? new Date().toISOString();
  return {
    machineId,
    machineName: pickString(payload, ['machine_name', 'machineName', 'hostname', 'device_name'])
      ?? pickString(signalPayload, ['machine_name', 'machineName', 'hostname', 'device_name']),
    userName: pickString(payload, ['user_name', 'userName', 'username', 'session_user', 'display_name'])
      ?? pickString(signalPayload, ['user_name', 'userName', 'username', 'session_user', 'display_name']),
    timestampUtc,
    lastSeenUtc: newestTimestamp([
      pickString(payload, ['last_seen_utc', 'lastSeenUtc']),
      pickString(signalPayload, ['last_seen_utc', 'lastSeenUtc']),
      timestampUtc
    ]),
    agentRunning: pickBoolean(payload, ['agent_running', 'agentRunning']),
    sessionConnected: pickBoolean(payload, ['user_session_connected', 'session_connected', 'sessionConnected'])
      ?? pickBoolean(signalPayload, ['user_session_connected', 'session_connected', 'sessionConnected']),
    activityDetected: pickBoolean(payload, ['activity_detected', 'activityDetected'])
      ?? pickBoolean(signalPayload, ['activity_detected', 'activityDetected']),
    lastActivityUtc: newestTimestamp([
      pickString(payload, ['last_activity_utc', 'lastActivityUtc', 'last_input_event_utc', 'lastInputEventUtc']),
      pickString(signalPayload, ['last_activity_utc', 'lastActivityUtc', 'last_input_event_utc', 'lastInputEventUtc'])
    ]),
    errorMessage: normalizeErrorMessage(
      pickString(payload, ['error', 'error_message', 'last_error', 'failure_reason'])
        ?? pickString(signalPayload, ['error', 'error_message', 'last_error', 'failure_reason'])
    )
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
  const statePayload = readSegmentPayload(raw, ['state', 'state_snapshot']);
  const signalPayload = readSegmentPayload(raw, ['signal', 'signals', 'signal_snapshot', 'inputs']);
  const actionPayload = readSegmentPayload(raw, ['action_execution', 'action']);
  const resultPayload = readSegmentPayload(raw, ['result', 'outcome']);

  return {
    machineId,
    machineName: pickString(signalPayload, ['machine_name', 'machineName', 'hostname', 'device_name'])
      ?? pickString(statePayload, ['machine_name', 'machineName', 'hostname', 'device_name']),
    userName: pickString(signalPayload, ['user_name', 'userName', 'username', 'session_user', 'display_name'])
      ?? pickString(statePayload, ['user_name', 'userName', 'username', 'session_user', 'display_name']),
    timestampUtc: newestTimestamp([
      pickString(signalPayload, ['timestamp', 'timestamp_utc', 'occurred_at_utc']),
      pickString(statePayload, ['timestamp', 'timestamp_utc', 'occurred_at_utc']),
      row.timestamp
    ]),
    sessionConnected: pickBoolean(signalPayload, ['user_session_connected', 'session_connected', 'sessionConnected']),
    activityDetected: pickBoolean(signalPayload, ['activity_detected', 'activityDetected']),
    lastActivityUtc: newestTimestamp([
      pickString(signalPayload, ['last_activity_utc', 'lastActivityUtc', 'last_input_event_utc', 'lastInputEventUtc']),
      pickString(statePayload, ['last_activity_utc', 'lastActivityUtc', 'last_input_event_utc', 'lastInputEventUtc'])
    ]),
    errorMessage: normalizeErrorMessage(
      pickString(resultPayload, ['error', 'error_message', 'failure_reason', 'last_error'])
        ?? pickString(actionPayload, ['error', 'error_message', 'failure_reason', 'last_error'])
        ?? pickString(signalPayload, ['error', 'error_message', 'failure_reason', 'last_error'])
        ?? pickString(statePayload, ['error', 'error_message', 'failure_reason', 'last_error'])
    )
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
  explicitError: string | null;
}): SystemHealthStatus {
  if (input.agentRunning !== 'Yes') return 'No';
  if (input.explicitSessionConnected === true) return 'Yes';
  if (input.explicitSessionConnected === false) return 'No';
  if (userSessionError(input.explicitError)) return 'No';
  return 'Unavailable';
}

function deriveActivityDetected(input: {
  agentRunning: SystemHealthStatus;
  userSessionConnected: SystemHealthStatus;
  explicitActivityDetected: boolean | null;
  lastActivityUtc: string | null;
  explicitError: string | null;
}): SystemHealthStatus {
  if (input.agentRunning !== 'Yes') return 'No';
  if (input.userSessionConnected === 'No') return 'No';
  if (input.explicitActivityDetected === true) return 'Yes';
  if (input.explicitActivityDetected === false) return 'No';
  if (isFresh(input.lastActivityUtc, ACTIVITY_FRESH_MS)) return 'Yes';
  if (input.lastActivityUtc) return 'No';
  if (captureError(input.explicitError)) return 'No';
  return 'Unavailable';
}

function deriveErrorMessage(input: {
  explicitError: string | null;
  alerts: AlertRecord[];
  agentRunning: SystemHealthStatus;
  lastSeenUtc: string | null;
}): string | null {
  if (input.explicitError) return input.explicitError;

  const alertMessage = alertErrorMessage(input.alerts);
  if (alertMessage) return alertMessage;

  if (input.agentRunning === 'No') {
    if (input.lastSeenUtc && !isFresh(input.lastSeenUtc, HEARTBEAT_FRESH_MS)) {
      return 'Heartbeat stale';
    }
    return 'No recent agent heartbeat';
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
          streamState?.timestampUtc,
          ...alerts.map((alert) => alert.last_seen_at)
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
        const explicitError = normalizeErrorMessage(
          (isFresh(streamState?.timestampUtc, STATE_FRESH_MS) ? streamState?.errorMessage : null)
            ?? (isFresh(traceState?.timestampUtc, STATE_FRESH_MS) ? traceState?.errorMessage : null)
            ?? null
        );

        const agentRunning = deriveAgentRunning({
          explicitAgentRunning,
          lastSeenUtc,
          alerts
        });
        const userSessionConnected = deriveUserSessionConnected({
          agentRunning,
          explicitSessionConnected,
          explicitError
        });
        const activityDetected = deriveActivityDetected({
          agentRunning,
          userSessionConnected,
          explicitActivityDetected,
          lastActivityUtc,
          explicitError
        });
        const errorMessage = deriveErrorMessage({
          explicitError,
          alerts,
          agentRunning,
          lastSeenUtc
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
            (isFresh(streamState?.timestampUtc, STATE_FRESH_MS) ? streamState?.userName : null)
              ?? (isFresh(traceState?.timestampUtc, STATE_FRESH_MS) ? traceState?.userName : null)
              ?? null
          ),
          lastSeenUtc,
          lastSeenLabel: timeLabel(lastSeenUtc, 'Unknown'),
          lastSeenStale: !isFresh(lastSeenUtc, HEARTBEAT_FRESH_MS),
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
