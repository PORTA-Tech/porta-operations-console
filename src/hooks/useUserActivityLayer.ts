import { useEffect, useMemo, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { fetchAuditDecisions } from '../api/operations';
import type { AuditDecisionRecord } from '../types/consoleOperations';
import type { SystemHealthRecord } from '../types/systemHealth';
import type {
  UserActivityBreakNeeded,
  UserActivityDeepWork,
  UserActivityFocusLevel,
  UserActivityOverloadRisk,
  UserActivityRecord,
  UserActivityTone
} from '../types/userActivity';
import { useSystemHealthLayer } from './useSystemHealthLayer';

const STATE_FRESH_MS = 2 * 60_000;

interface StreamActivityState {
  machineId: string;
  machineName: string | null;
  userName: string | null;
  timestampUtc: string;
  taskContinuityScore: number | null;
  taskContinuitySeconds: number | null;
  continuityState: string | null;
  deepWorkActive: boolean | null;
  overloadLikelihood: number | null;
  overloadActive: boolean | null;
  breakNeeded: boolean | null;
  breakPendingAction: string | null;
  breakPendingReasonCode: string | null;
  partialData: boolean | null;
  missingChannels: string[];
}

interface TraceActivityState {
  machineId: string;
  machineName: string | null;
  userName: string | null;
  timestampUtc: string | null;
  taskContinuityScore: number | null;
  taskContinuitySeconds: number | null;
  continuityState: string | null;
  deepWorkActive: boolean | null;
  overloadLikelihood: number | null;
  overloadActive: boolean | null;
  breakNeeded: boolean | null;
  breakPendingAction: string | null;
  breakPendingReasonCode: string | null;
  partialData: boolean | null;
  missingChannels: string[];
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

function parseNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = parseNumber(record[key]);
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

function pickNumberFromRecords(records: Array<Record<string, unknown>>, keys: string[]): number | null {
  for (const record of records) {
    const value = pickNumber(record, keys);
    if (value !== null) return value;
  }
  return null;
}

function pickStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    const normalized = value
      .map((entry) => parseString(entry))
      .filter((entry): entry is string => entry !== null);
    if (normalized.length > 0) return normalized;
  }
  return [];
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

function machineIdFromTrace(row: AuditDecisionRecord): string | null {
  const machineId = (row.machine_id ?? '').trim();
  if (machineId.length > 0) return machineId;
  const agentId = row.agent_id.trim();
  return agentId.length > 0 ? agentId : null;
}

function normalizeContinuityState(value: string | null): string | null {
  return value ? value.trim().toLowerCase() : null;
}

function machineNameLabel(value: string | null): string {
  return value ?? 'Unknown machine';
}

function userNameLabel(value: string | null): string {
  return value ?? 'Unknown user';
}

function formatMissingChannels(channels: string[]): string {
  return channels
    .map((channel) => channel.trim())
    .filter((channel) => channel.length > 0)
    .map((channel) => channel.charAt(0).toUpperCase() + channel.slice(1))
    .join(', ');
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

function behaviorBlockingReason(health: SystemHealthRecord | null): string | null {
  if (!health) return 'System Health is unavailable for this machine';
  if (health.agentRunning !== 'Yes') return health.errorMessage ?? 'Agent is not running';
  if (health.userSessionConnected !== 'Yes') return health.errorMessage ?? 'No live user session is connected';
  if (health.lastSeenStale) return health.errorMessage ?? 'System Health is stale';

  if (health.errorMessage) {
    const operational = /(capture|collecting|backend|auth|migration|ownership|heartbeat|session|disconnect|stale)/i;
    if (operational.test(health.errorMessage)) {
      return health.errorMessage;
    }
  }

  return null;
}

function hasBehaviorTruth(state: Pick<
  StreamActivityState | TraceActivityState,
  'taskContinuityScore' | 'taskContinuitySeconds' | 'continuityState' | 'deepWorkActive' | 'overloadLikelihood' | 'overloadActive'
>): boolean {
  return state.taskContinuityScore !== null
    || state.taskContinuitySeconds !== null
    || state.continuityState !== null
    || state.deepWorkActive !== null
    || state.overloadLikelihood !== null
    || state.overloadActive !== null;
}

function mapFocusLevel(state: Pick<
  StreamActivityState | TraceActivityState,
  'taskContinuityScore' | 'taskContinuitySeconds' | 'continuityState' | 'deepWorkActive'
>): UserActivityFocusLevel {
  const continuitySeconds = Math.max(0, state.taskContinuitySeconds ?? 0);
  const continuityScore = state.taskContinuityScore ?? 0;
  const continuityState = normalizeContinuityState(state.continuityState);

  if (
    continuityState === null
    && state.taskContinuityScore === null
    && state.taskContinuitySeconds === null
    && state.deepWorkActive === null
  ) {
    return 'Unavailable';
  }

  if (state.deepWorkActive === true) return 'High';

  if (continuityState === 'keep') {
    if (continuitySeconds >= 900) return 'High';
    if (continuitySeconds >= 120) return 'Medium';
    return 'Low';
  }

  if (continuityState === 'pause') {
    return continuitySeconds >= 300 ? 'Medium' : 'Low';
  }

  if (continuityState === 'decay') {
    return continuitySeconds >= 600 ? 'Medium' : 'Low';
  }

  if (continuityState === 'reset') {
    return 'Low';
  }

  if (continuityScore >= 0.67 && continuitySeconds >= 900) return 'High';
  if (continuityScore >= 0.34 || continuitySeconds >= 120) return 'Medium';
  return 'Low';
}

function mapDeepWork(state: Pick<StreamActivityState | TraceActivityState, 'deepWorkActive'>): UserActivityDeepWork {
  if (state.deepWorkActive === true) return 'Active';
  if (state.deepWorkActive === false) return 'Not active';
  return 'Unavailable';
}

function mapOverloadRisk(state: Pick<
  StreamActivityState | TraceActivityState,
  'overloadLikelihood' | 'overloadActive'
>): UserActivityOverloadRisk {
  if (state.overloadActive === true) return 'High';
  if (state.overloadLikelihood === null) return 'Unavailable';
  if (state.overloadLikelihood >= 0.72) return 'High';
  if (state.overloadLikelihood >= 0.4) return 'Medium';
  return 'Low';
}

function mapBreakNeeded(state: Pick<
  StreamActivityState | TraceActivityState,
  'breakNeeded' | 'breakPendingAction' | 'breakPendingReasonCode'
>): UserActivityBreakNeeded {
  if (state.breakNeeded === true) return 'Yes';
  if (state.breakNeeded === false) return 'No';
  if (state.breakPendingAction !== null || state.breakPendingReasonCode !== null) return 'Yes';
  return 'Unavailable';
}

function focusDurationFromState(state: Pick<
  StreamActivityState | TraceActivityState,
  'taskContinuitySeconds'
>): number | null {
  return state.taskContinuitySeconds === null ? null : Math.max(0, state.taskContinuitySeconds);
}

function limitationNote(input: {
  healthBlockReason: string | null;
  stateTimestampUtc: string | null;
  hasFreshState: boolean;
  hasBehaviorTruth: boolean;
  partialData: boolean | null;
  missingChannels: string[];
}): string | null {
  if (input.healthBlockReason) return input.healthBlockReason;
  if (!input.stateTimestampUtc) return 'No recent behavior state is available';
  if (!input.hasFreshState) return 'Behavior state is stale';
  if (!input.hasBehaviorTruth) return 'Backend state is missing continuity or overload fields';
  if (input.partialData === true && input.missingChannels.length > 0) {
    return `Behavior state is partial: missing ${formatMissingChannels(input.missingChannels)} signals`;
  }
  if (input.partialData === true) return 'Behavior state is partial';
  if (input.missingChannels.length > 0) {
    return `Behavior state is limited: missing ${formatMissingChannels(input.missingChannels)} signals`;
  }
  return null;
}

function parseStreamActivityState(payload: Record<string, unknown>): StreamActivityState | null {
  const machineId = pickString(payload, ['machine_id', 'machineId', 'agent_id', 'node_id']);
  if (!machineId) return null;

  const statePayload = readSegmentPayload(payload, ['state', 'state_snapshot', 'snapshot', 'current']);
  const statusPayload = readSegmentPayload(payload, ['status', 'runtime', 'runtime_status']);
  const signalPayload = readSegmentPayload(payload, ['signal', 'signals', 'signal_snapshot', 'inputs']);
  const dataQualityPayload = readSegmentPayload(payload, ['data_quality']);
  const records = [payload, statePayload, statusPayload, signalPayload, dataQualityPayload];

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
      pickStringFromRecords(records, ['timestamp', 'timestamp_utc', 'at_utc', 'last_updated_utc', 'lastUpdatedUtc']),
      new Date().toISOString()
    ]) ?? new Date().toISOString(),
    taskContinuityScore: pickNumberFromRecords(records, ['task_continuity_score', 'taskContinuityScore', 'behavior_continuity_score']),
    taskContinuitySeconds: pickNumberFromRecords(records, [
      'task_continuity_seconds',
      'taskContinuitySeconds',
      'sustained_attention_duration_sec',
      'sustained_attention_duration'
    ]),
    continuityState: pickStringFromRecords(records, ['continuity_state', 'continuityState']),
    deepWorkActive: pickBooleanFromRecords(records, ['deep_work_active', 'deepWorkActive']),
    overloadLikelihood: pickNumberFromRecords(records, ['overload_likelihood', 'overloadLikelihood', 'overload']),
    overloadActive: pickBooleanFromRecords(records, ['overload_active', 'overloadActive']),
    breakNeeded: pickBooleanFromRecords(records, ['break_needed', 'breakNeeded', 'break_ready', 'breakReady']),
    breakPendingAction: pickStringFromRecords(records, ['break_pending_action', 'breakPendingAction']),
    breakPendingReasonCode: pickStringFromRecords(records, ['break_pending_reason_code', 'breakPendingReasonCode']),
    partialData: pickBooleanFromRecords(records, ['partial_data', 'partialData']),
    missingChannels: pickStringArray(payload, ['missing_major_channels', 'missingChannels']).length > 0
      ? pickStringArray(payload, ['missing_major_channels', 'missingChannels'])
      : pickStringArray(dataQualityPayload, ['missing_major_channels', 'missingChannels'])
  };
}

function traceActivityState(row: AuditDecisionRecord): TraceActivityState | null {
  const machineId = machineIdFromTrace(row);
  if (!machineId) return null;

  const raw = toRecord(row.raw_trace);
  const statePayload = readSegmentPayload(raw, ['state', 'state_snapshot', 'snapshot', 'current']);
  const statusPayload = readSegmentPayload(raw, ['status', 'runtime', 'runtime_status']);
  const signalPayload = readSegmentPayload(raw, ['signal', 'signals', 'signal_snapshot', 'inputs']);
  const dataQualityPayload = readSegmentPayload(raw, ['data_quality']);
  const records = [statePayload, statusPayload, signalPayload, raw, dataQualityPayload];

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
    taskContinuityScore: pickNumberFromRecords(records, ['task_continuity_score', 'taskContinuityScore', 'behavior_continuity_score']),
    taskContinuitySeconds: pickNumberFromRecords(records, [
      'task_continuity_seconds',
      'taskContinuitySeconds',
      'sustained_attention_duration_sec',
      'sustained_attention_duration'
    ]),
    continuityState: pickStringFromRecords(records, ['continuity_state', 'continuityState']),
    deepWorkActive: pickBooleanFromRecords(records, ['deep_work_active', 'deepWorkActive']),
    overloadLikelihood: pickNumberFromRecords(records, ['overload_likelihood', 'overloadLikelihood', 'overload']),
    overloadActive: pickBooleanFromRecords(records, ['overload_active', 'overloadActive']),
    breakNeeded: pickBooleanFromRecords(records, ['break_needed', 'breakNeeded', 'break_ready', 'breakReady']),
    breakPendingAction: pickStringFromRecords(records, ['break_pending_action', 'breakPendingAction']),
    breakPendingReasonCode: pickStringFromRecords(records, ['break_pending_reason_code', 'breakPendingReasonCode']),
    partialData: pickBooleanFromRecords(records, ['partial_data', 'partialData']),
    missingChannels: pickStringArray(raw, ['missing_major_channels', 'missingChannels']).length > 0
      ? pickStringArray(raw, ['missing_major_channels', 'missingChannels'])
      : pickStringArray(dataQualityPayload, ['missing_major_channels', 'missingChannels'])
  };
}

function toneRank(value: UserActivityTone): number {
  if (value === 'unavailable') return 0;
  if (value === 'limited') return 1;
  return 2;
}

export function useUserActivityLayer(): {
  records: UserActivityRecord[];
  loading: boolean;
  error: ApiError | undefined;
  lastRefreshUtc: string | undefined;
  notices: string[];
} {
  const systemHealth = useSystemHealthLayer();
  const [auditRows, setAuditRows] = useState<AuditDecisionRecord[]>([]);
  const [streamRows, setStreamRows] = useState<Record<string, StreamActivityState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [lastRefreshUtc, setLastRefreshUtc] = useState<string | undefined>(undefined);
  const [notices, setNotices] = useState<string[]>([]);
  const wsBase = import.meta.env.VITE_WS_BASE_URL?.trim();

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      try {
        const traces = await fetchAuditDecisions({ throwOnError: true });
        if (!mounted) return;
        setAuditRows(traces);
        setError(undefined);
        setNotices([]);
      } catch (nextError) {
        if (!mounted) return;
        setAuditRows([]);
        setError(toApiError(nextError));
        setNotices([`User activity trace feed unavailable: ${toApiError(nextError).message}`]);
      } finally {
        if (!mounted) return;
        setLastRefreshUtc(new Date().toISOString());
        setLoading(false);
      }
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
          const parsed = parseStreamActivityState(payload);
          if (!parsed) return;
          setStreamRows((current) => ({
            ...current,
            [parsed.machineId]: parsed
          }));
        } catch {
          // Ignore malformed realtime payloads; the polled trace feed remains authoritative.
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

  const records = useMemo<UserActivityRecord[]>(() => {
    const healthByMachine = new Map<string, SystemHealthRecord>();
    for (const row of systemHealth.records) {
      healthByMachine.set(row.machineId, row);
    }

    const traceByMachine = new Map<string, TraceActivityState>();
    for (const row of auditRows) {
      const parsed = traceActivityState(row);
      if (!parsed?.machineId) continue;

      const current = traceByMachine.get(parsed.machineId);
      const currentMs = parseTimestamp(current?.timestampUtc ?? null) ?? Number.NEGATIVE_INFINITY;
      const nextMs = parseTimestamp(parsed.timestampUtc) ?? Number.NEGATIVE_INFINITY;
      if (nextMs > currentMs) {
        traceByMachine.set(parsed.machineId, parsed);
      }
    }

    const machineIds = new Set<string>([
      ...healthByMachine.keys(),
      ...traceByMachine.keys(),
      ...Object.keys(streamRows)
    ]);

    return [...machineIds]
      .map((machineId) => {
        const health = healthByMachine.get(machineId) ?? null;
        const streamState = streamRows[machineId] ?? null;
        const traceState = traceByMachine.get(machineId) ?? null;
        const freshStreamState = streamState && isFresh(streamState.timestampUtc, STATE_FRESH_MS) ? streamState : null;
        const freshTraceState = traceState && isFresh(traceState.timestampUtc, STATE_FRESH_MS) ? traceState : null;
        const liveState = freshStreamState ?? freshTraceState;
        const latestStateTimestampUtc = newestTimestamp([
          streamState?.timestampUtc,
          traceState?.timestampUtc
        ]);
        const healthBlockReason = behaviorBlockingReason(health);
        const behaviorTruth = liveState ? hasBehaviorTruth(liveState) : false;
        const note = limitationNote({
          healthBlockReason,
          stateTimestampUtc: latestStateTimestampUtc,
          hasFreshState: liveState !== null,
          hasBehaviorTruth: behaviorTruth,
          partialData: liveState?.partialData ?? null,
          missingChannels: liveState?.missingChannels ?? []
        });
        const tone: UserActivityTone = healthBlockReason || liveState === null || !behaviorTruth
          ? 'unavailable'
          : note
            ? 'limited'
            : 'live';

        const focusLevel = tone === 'unavailable' || !liveState ? 'Unavailable' : mapFocusLevel(liveState);
        const deepWork = tone === 'unavailable' || !liveState ? 'Unavailable' : mapDeepWork(liveState);
        const overloadRisk = tone === 'unavailable' || !liveState ? 'Unavailable' : mapOverloadRisk(liveState);
        const breakNeeded = tone === 'unavailable' || !liveState
          ? 'Unavailable'
          : (() => {
              const mapped = mapBreakNeeded(liveState);
              return mapped === 'Unavailable' && behaviorTruth ? 'No' : mapped;
            })();
        const focusDurationSec = tone === 'unavailable' || !liveState ? null : focusDurationFromState(liveState);

        return {
          machineId,
          machineName: machineNameLabel(
            health?.machineName
              ?? streamState?.machineName
              ?? traceState?.machineName
              ?? null
          ),
          userName: userNameLabel(
            health?.userName
              ?? liveState?.userName
              ?? streamState?.userName
              ?? traceState?.userName
              ?? null
          ),
          focusLevel,
          deepWork,
          overloadRisk,
          focusDurationSec,
          focusDurationLabel: tone === 'unavailable'
            ? formatDuration(null, 'Unavailable')
            : formatDuration(focusDurationSec, 'Unknown'),
          breakNeeded,
          stateTimestampUtc: latestStateTimestampUtc,
          stateStale: latestStateTimestampUtc !== null && !isFresh(latestStateTimestampUtc, STATE_FRESH_MS),
          note,
          tone
        } satisfies UserActivityRecord;
      })
      .sort((left, right) => {
        const toneDelta = toneRank(left.tone) - toneRank(right.tone);
        if (toneDelta !== 0) return toneDelta;
        return (parseTimestamp(right.stateTimestampUtc) ?? 0) - (parseTimestamp(left.stateTimestampUtc) ?? 0);
      });
  }, [auditRows, streamRows, systemHealth.records]);

  const mergedNotices = useMemo(() => {
    const deduped = new Set<string>([...systemHealth.notices, ...notices]);
    return [...deduped];
  }, [notices, systemHealth.notices]);

  return useMemo(
    () => ({
      records,
      loading: loading || systemHealth.loading,
      error: error ?? systemHealth.error,
      lastRefreshUtc: lastRefreshUtc ?? systemHealth.lastRefreshUtc,
      notices: mergedNotices
    }),
    [error, lastRefreshUtc, loading, mergedNotices, records, systemHealth.error, systemHealth.lastRefreshUtc, systemHealth.loading]
  );
}
