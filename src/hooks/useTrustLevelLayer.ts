import { useEffect, useMemo, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { fetchAuditDecisions } from '../api/operations';
import type { AuditDecisionRecord } from '../types/consoleOperations';
import type { SystemHealthRecord } from '../types/systemHealth';
import type {
  TrustConfidence,
  TrustDataQuality,
  TrustLearningStage,
  TrustLevelRecord,
  TrustLevelTone
} from '../types/trustLevel';
import { useSystemHealthLayer } from './useSystemHealthLayer';

const STATE_FRESH_MS = 2 * 60_000;
const QUALITY_POOR_THRESHOLD = 0.55;
const QUALITY_GOOD_THRESHOLD = 0.65;
const CONFIDENCE_MEDIUM_THRESHOLD = 0.5;
const CONFIDENCE_HIGH_THRESHOLD = 0.75;

interface StreamTrustState {
  machineId: string;
  machineName: string | null;
  userName: string | null;
  timestampUtc: string;
  learningStage: string | null;
  calibrationStage: string | null;
  baselineReady: boolean | null;
  coldStart: boolean | null;
  currentQualityScore: number | null;
  signalQualityScore: number | null;
  partialData: boolean | null;
  missingChannels: string[];
  modelConfidence: number | null;
  continuityConfidence: number | null;
  confidenceScore: number | null;
}

interface TraceTrustState {
  machineId: string;
  machineName: string | null;
  userName: string | null;
  timestampUtc: string | null;
  learningStage: string | null;
  calibrationStage: string | null;
  baselineReady: boolean | null;
  coldStart: boolean | null;
  currentQualityScore: number | null;
  signalQualityScore: number | null;
  partialData: boolean | null;
  missingChannels: string[];
  modelConfidence: number | null;
  continuityConfidence: number | null;
  confidenceScore: number | null;
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

function healthTrustLimitation(health: SystemHealthRecord | null): string | null {
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

function normalizeStage(value: string | null): string | null {
  return value ? value.trim().toLowerCase() : null;
}

function mapLearningStage(state: Pick<
  StreamTrustState | TraceTrustState,
  'learningStage' | 'calibrationStage' | 'baselineReady' | 'coldStart'
>): TrustLearningStage {
  const explicit = normalizeStage(state.learningStage);
  if (explicit === 'ready') return 'Ready';
  if (explicit === 'learning') return 'Learning';

  const calibrationStage = normalizeStage(state.calibrationStage);
  if (calibrationStage === 'calibrated' || calibrationStage === 'ready') return 'Ready';
  if (calibrationStage === 'provisional' || calibrationStage === 'cold' || calibrationStage === 'learning') {
    return 'Learning';
  }

  if (state.baselineReady === true) return 'Ready';
  if (state.coldStart === true) return 'Learning';
  return 'Learning';
}

function qualityScoreFromState(state: Pick<
  StreamTrustState | TraceTrustState,
  'currentQualityScore' | 'signalQualityScore'
>): number | null {
  return state.currentQualityScore ?? state.signalQualityScore ?? null;
}

function mapDataQuality(input: {
  state: Pick<StreamTrustState | TraceTrustState, 'currentQualityScore' | 'signalQualityScore' | 'partialData' | 'missingChannels'> | null;
  healthLimitation: string | null;
  hasFreshState: boolean;
}): TrustDataQuality {
  if (input.healthLimitation) return 'Poor';
  if (!input.state || !input.hasFreshState) return 'Poor';

  const score = qualityScoreFromState(input.state);
  const missingCount = input.state.missingChannels.length;
  const partialData = input.state.partialData === true;

  if (score !== null && score < QUALITY_POOR_THRESHOLD) return 'Poor';
  if (missingCount >= 2) return 'Poor';
  if (partialData || missingCount > 0) return 'Partial';
  if (score !== null && score < QUALITY_GOOD_THRESHOLD) return 'Partial';
  if (score !== null) return 'Good';
  return 'Partial';
}

function confidenceScoreFromState(state: Pick<
  StreamTrustState | TraceTrustState,
  'modelConfidence' | 'continuityConfidence' | 'confidenceScore'
>): number | null {
  return state.modelConfidence ?? state.continuityConfidence ?? state.confidenceScore ?? null;
}

function mapConfidence(input: {
  state: Pick<StreamTrustState | TraceTrustState, 'modelConfidence' | 'continuityConfidence' | 'confidenceScore'> | null;
  dataQuality: TrustDataQuality;
  healthLimitation: string | null;
  hasFreshState: boolean;
}): TrustConfidence {
  if (input.healthLimitation || !input.state || !input.hasFreshState) return 'Low';

  const score = confidenceScoreFromState(input.state);
  let label: TrustConfidence;

  if (score === null) {
    label = 'Low';
  } else if (score >= CONFIDENCE_HIGH_THRESHOLD) {
    label = 'High';
  } else if (score >= CONFIDENCE_MEDIUM_THRESHOLD) {
    label = 'Medium';
  } else {
    label = 'Low';
  }

  if (input.dataQuality === 'Poor') return 'Low';
  if (input.dataQuality === 'Partial' && label === 'High') return 'Medium';
  return label;
}

function hasTrustTruth(state: Pick<
  StreamTrustState | TraceTrustState,
  'learningStage' | 'calibrationStage' | 'baselineReady' | 'coldStart' | 'currentQualityScore' | 'signalQualityScore' | 'partialData' | 'missingChannels' | 'modelConfidence' | 'continuityConfidence' | 'confidenceScore'
>): boolean {
  return state.learningStage !== null
    || state.calibrationStage !== null
    || state.baselineReady !== null
    || state.coldStart !== null
    || state.currentQualityScore !== null
    || state.signalQualityScore !== null
    || state.partialData !== null
    || state.missingChannels.length > 0
    || state.modelConfidence !== null
    || state.continuityConfidence !== null
    || state.confidenceScore !== null;
}

function trustNote(input: {
  healthLimitation: string | null;
  stateTimestampUtc: string | null;
  hasFreshState: boolean;
  hasTrustTruth: boolean;
  dataQuality: TrustDataQuality;
  missingChannels: string[];
}): string | null {
  if (input.healthLimitation) return input.healthLimitation;
  if (!input.stateTimestampUtc) return 'No recent trust state is available';
  if (!input.hasFreshState) return 'Trust state is stale';
  if (!input.hasTrustTruth) return 'Backend state is missing trust inputs';
  if (input.dataQuality === 'Poor' && input.missingChannels.length > 0) {
    return `Signal quality is poor: missing ${formatMissingChannels(input.missingChannels)} signals`;
  }
  if (input.dataQuality === 'Partial' && input.missingChannels.length > 0) {
    return `Signal quality is partial: missing ${formatMissingChannels(input.missingChannels)} signals`;
  }
  if (input.dataQuality === 'Poor') return 'Signal quality is poor';
  if (input.dataQuality === 'Partial') return 'Signal quality is partial';
  return null;
}

function parseStreamTrustState(payload: Record<string, unknown>): StreamTrustState | null {
  const machineId = pickString(payload, ['machine_id', 'machineId', 'agent_id', 'node_id']);
  if (!machineId) return null;

  const statePayload = readSegmentPayload(payload, ['state', 'state_snapshot', 'snapshot', 'current']);
  const statusPayload = readSegmentPayload(payload, ['status', 'runtime', 'runtime_status']);
  const signalPayload = readSegmentPayload(payload, ['signal', 'signals', 'signal_snapshot', 'inputs']);
  const dataQualityPayload = readSegmentPayload(payload, ['data_quality']);
  const records = [payload, statePayload, statusPayload, signalPayload, dataQualityPayload];
  const payloadMissingChannels = pickStringArray(payload, ['missing_major_channels', 'missingChannels']);
  const dataQualityMissingChannels = pickStringArray(dataQualityPayload, ['missing_major_channels', 'missingChannels']);

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
    learningStage: pickStringFromRecords(records, ['learning_stage', 'learningStage']),
    calibrationStage: pickStringFromRecords(records, ['calibration_stage', 'calibrationStage']),
    baselineReady: pickBooleanFromRecords(records, ['baseline_ready', 'baselineReady']),
    coldStart: pickBooleanFromRecords(records, ['cold_start', 'coldStart']),
    currentQualityScore: pickNumberFromRecords(records, ['current_quality_score', 'currentQualityScore', 'quality_score', 'qualityScore']),
    signalQualityScore: pickNumberFromRecords(records, ['signal_quality_score', 'signalQualityScore']),
    partialData: pickBooleanFromRecords(records, ['partial_data', 'partialData']),
    missingChannels: payloadMissingChannels.length > 0 ? payloadMissingChannels : dataQualityMissingChannels,
    modelConfidence: pickNumberFromRecords(records, ['model_confidence', 'modelConfidence']),
    continuityConfidence: pickNumberFromRecords(records, ['continuity_confidence', 'continuityConfidence']),
    confidenceScore: pickNumberFromRecords(records, ['confidence_score', 'confidenceScore', 'confidence'])
  };
}

function traceTrustState(row: AuditDecisionRecord): TraceTrustState | null {
  const machineId = machineIdFromTrace(row);
  if (!machineId) return null;

  const raw = toRecord(row.raw_trace);
  const statePayload = readSegmentPayload(raw, ['state', 'state_snapshot', 'snapshot', 'current']);
  const statusPayload = readSegmentPayload(raw, ['status', 'runtime', 'runtime_status']);
  const signalPayload = readSegmentPayload(raw, ['signal', 'signals', 'signal_snapshot', 'inputs']);
  const dataQualityPayload = readSegmentPayload(raw, ['data_quality']);
  const records = [statePayload, statusPayload, signalPayload, raw, dataQualityPayload];
  const rawMissingChannels = pickStringArray(raw, ['missing_major_channels', 'missingChannels']);
  const stateMissingChannels = pickStringArray(statePayload, ['missing_major_channels', 'missingChannels']);
  const dataQualityMissingChannels = pickStringArray(dataQualityPayload, ['missing_major_channels', 'missingChannels']);

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
    learningStage: pickStringFromRecords(records, ['learning_stage', 'learningStage']),
    calibrationStage: pickStringFromRecords(records, ['calibration_stage', 'calibrationStage']),
    baselineReady: pickBooleanFromRecords(records, ['baseline_ready', 'baselineReady']),
    coldStart: pickBooleanFromRecords(records, ['cold_start', 'coldStart']),
    currentQualityScore: pickNumberFromRecords(records, ['current_quality_score', 'currentQualityScore', 'quality_score', 'qualityScore']),
    signalQualityScore: pickNumberFromRecords(records, ['signal_quality_score', 'signalQualityScore']),
    partialData: pickBooleanFromRecords(records, ['partial_data', 'partialData']),
    missingChannels: rawMissingChannels.length > 0
      ? rawMissingChannels
      : stateMissingChannels.length > 0
        ? stateMissingChannels
        : dataQualityMissingChannels,
    modelConfidence: pickNumberFromRecords(records, ['model_confidence', 'modelConfidence']),
    continuityConfidence: pickNumberFromRecords(records, ['continuity_confidence', 'continuityConfidence']),
    confidenceScore: pickNumberFromRecords(records, ['confidence_score', 'confidenceScore', 'confidence']) ?? parseNumber(row.confidence_score)
  };
}

function toneRank(value: TrustLevelTone): number {
  if (value === 'unavailable') return 0;
  if (value === 'limited') return 1;
  return 2;
}

export function useTrustLevelLayer(): {
  records: TrustLevelRecord[];
  loading: boolean;
  error: ApiError | undefined;
  lastRefreshUtc: string | undefined;
  notices: string[];
} {
  const systemHealth = useSystemHealthLayer();
  const [auditRows, setAuditRows] = useState<AuditDecisionRecord[]>([]);
  const [streamRows, setStreamRows] = useState<Record<string, StreamTrustState>>({});
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
        setNotices([`Trust trace feed unavailable: ${toApiError(nextError).message}`]);
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
          const parsed = parseStreamTrustState(payload);
          if (!parsed) return;
          setStreamRows((current) => ({
            ...current,
            [parsed.machineId]: parsed
          }));
        } catch {
          // Ignore malformed realtime payloads; polled traces remain authoritative.
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

  const records = useMemo<TrustLevelRecord[]>(() => {
    const healthByMachine = new Map<string, SystemHealthRecord>();
    for (const row of systemHealth.records) {
      healthByMachine.set(row.machineId, row);
    }

    const traceByMachine = new Map<string, TraceTrustState>();
    for (const row of auditRows) {
      const parsed = traceTrustState(row);
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
        const healthLimitation = healthTrustLimitation(health);
        const stateHasTrustTruth = liveState ? hasTrustTruth(liveState) : false;
        const learningStage = mapLearningStage({
          learningStage: liveState?.learningStage ?? null,
          calibrationStage: liveState?.calibrationStage ?? null,
          baselineReady: liveState?.baselineReady ?? null,
          coldStart: liveState?.coldStart ?? null
        });
        const dataQuality = mapDataQuality({
          state: liveState,
          healthLimitation,
          hasFreshState: liveState !== null
        });
        const confidence = mapConfidence({
          state: liveState,
          dataQuality,
          healthLimitation,
          hasFreshState: liveState !== null
        });
        const note = trustNote({
          healthLimitation,
          stateTimestampUtc: latestStateTimestampUtc,
          hasFreshState: liveState !== null,
          hasTrustTruth: stateHasTrustTruth,
          dataQuality,
          missingChannels: liveState?.missingChannels ?? []
        });
        const tone: TrustLevelTone = healthLimitation || liveState === null || !stateHasTrustTruth
          ? 'unavailable'
          : note
            ? 'limited'
            : 'live';

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
          learningStage,
          confidence,
          dataQuality,
          stateTimestampUtc: latestStateTimestampUtc,
          stateStale: latestStateTimestampUtc !== null && !isFresh(latestStateTimestampUtc, STATE_FRESH_MS),
          note,
          tone
        } satisfies TrustLevelRecord;
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
