import { useEffect, useMemo, useRef, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { getNodeSnapshot, type NodeSnapshotRow } from '../api/nodes';
import { fetchAlerts, fetchAuditDecisions } from '../api/operations';
import type { AlertRecord, AuditDecisionRecord } from '../types/consoleOperations';
import type {
  OperationsActionItem,
  OperationsActionResult,
  OperationsActionType,
  OperationsConsoleRecord,
  OperationsDataQuality,
  OperationsLearningStage,
  OperationsMachineHealth,
  OperationsRiskLabel,
  OperationsTruthLabel
} from '../types/operationsConsole';

const HEARTBEAT_FRESH_MS = 45_000;
const STATE_FRESH_MS = 5 * 60_000;
const ACTIVITY_FRESH_MS = 2 * 60_000;
const MAX_ACTIONS_PER_MACHINE = 12;

interface StreamMachineState {
  machineId: string;
  machineName: string | null;
  userId: string | null;
  userName: string | null;
  timestampUtc: string;
  lastSeenAtUtc: string | null;
  lastActivityAtUtc: string | null;
  agentRunning: boolean | null;
  sessionConnected: boolean | null;
  activityDetected: boolean | null;
  focusScore: number | null;
  overloadScore: number | null;
  deepWorkActive: boolean | null;
  focusDurationSec: number | null;
  breakNeeded: boolean | null;
  attentionSegmentKind: string | null;
  distractionEpisodeActive: boolean | null;
  distractionEpisodeSeconds: number | null;
  attentionSegmentReasonCode: string | null;
  attentionSegmentReasonText: string | null;
  confidenceScore: number | null;
  trustTier: string | null;
  learningStage: string | null;
  calibrationStage: string | null;
  baselineReady: boolean | null;
  coldStart: boolean | null;
  qualityScore: number | null;
  partialData: boolean | null;
  missingChannels: string[];
  errorMessage: string | null;
}

type ActionPayloadBundle = {
  statePayload: Record<string, unknown>;
  signalPayload: Record<string, unknown>;
  actionPayload: Record<string, unknown>;
  resultPayload: Record<string, unknown>;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function normalizeBreakKind(value: string | null): 'short_break' | 'long_break' | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (normalized === 'short_break' || normalized === 'stretch_break_suggestion') return 'short_break';
  if (normalized === 'long_break' || normalized === 'break_suggestion') return 'long_break';
  return null;
}

function displayBreakLabel(value: string | null): string | null {
  const breakKind = normalizeBreakKind(value);
  if (breakKind === 'short_break') return 'Short break';
  if (breakKind === 'long_break') return 'Long break';
  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = parseString(record[key]);
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

function pickBoolean(record: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = parseBoolean(record[key]);
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
    if (Object.keys(candidate).length > 0) {
      return candidate;
    }
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

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function newestTimestamp(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const ms = parseTimestamp(value ?? null);
    if (ms === null || ms <= bestMs) continue;
    bestMs = ms;
    best = value ?? null;
  }
  return best;
}

function isFresh(value: string | null | undefined, windowMs: number): boolean {
  const parsed = parseTimestamp(value ?? null);
  return parsed !== null && (Date.now() - parsed) <= windowMs;
}

function toTruthLabel(value: boolean | null): OperationsTruthLabel {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Unknown';
}

function confidenceLabel(score: number | null, trustTier: string | null): OperationsRiskLabel {
  const explicit = trustTier?.toLowerCase();
  if (explicit === 'high') return 'High';
  if (explicit === 'medium') return 'Medium';
  if (explicit === 'low') return 'Low';
  if (score === null) return 'Unknown';
  if (score >= 0.75) return 'High';
  if (score >= 0.45) return 'Medium';
  return 'Low';
}

function riskLabel(score: number | null): OperationsRiskLabel {
  if (score === null) return 'Unknown';
  if (score >= 0.67) return 'High';
  if (score >= 0.34) return 'Medium';
  return 'Low';
}

function focusLabel(score: number | null): OperationsRiskLabel {
  if (score === null) return 'Unknown';
  if (score >= 0.67) return 'High';
  if (score >= 0.34) return 'Medium';
  return 'Low';
}

function learningStageLabel(input: {
  explicit: string | null;
  calibrationStage: string | null;
  baselineReady: boolean | null;
  coldStart: boolean | null;
}): OperationsLearningStage {
  const explicit = input.explicit?.toLowerCase();
  if (explicit === 'ready') return 'Ready';
  if (explicit === 'learning') return 'Learning';

  const calibrationStage = input.calibrationStage?.toLowerCase();
  if (calibrationStage === 'calibrated' || calibrationStage === 'ready') return 'Ready';
  if (calibrationStage === 'cold' || calibrationStage === 'provisional' || calibrationStage === 'learning') return 'Learning';

  if (input.baselineReady === true) return 'Ready';
  if (input.coldStart === true) return 'Learning';
  return 'Unknown';
}

function dataQualityLabel(input: {
  qualityScore: number | null;
  partialData: boolean | null;
  missingChannels: string[];
  layer1Blocked: boolean;
  hasStateTruth: boolean;
}): OperationsDataQuality {
  if (input.partialData === true) return 'Partial';
  if (input.missingChannels.length > 0) return 'Partial';
  if (input.qualityScore !== null) {
    if (input.qualityScore >= 0.75) return 'Good';
    if (input.qualityScore >= 0.4) return 'Partial';
    return 'Poor';
  }
  if (input.layer1Blocked) return 'Poor';
  if (input.hasStateTruth) return 'Partial';
  return 'Unknown';
}

function actionActivityLabel(value: boolean | null): 'Active' | 'Not active' | 'Unknown' {
  if (value === true) return 'Active';
  if (value === false) return 'Not active';
  return 'Unknown';
}

function humanizeAction(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pickMachineIdFromAlert(alert: AlertRecord): string | null {
  const raw = alert as unknown as Record<string, unknown>;
  const direct = [
    parseString(raw.machine_id),
    parseString(raw.machineId),
    parseString(raw.agent_id),
    parseString(raw.agentId),
    parseString(raw.node_id),
    parseString(raw.nodeId),
    parseString(alert.target_service)
  ];

  for (const candidate of direct) {
    if (!candidate) continue;
    if (!/\s/.test(candidate)) return candidate;
    const token = candidate.match(/\b(?:machine|node|agent)[-_:][A-Za-z0-9._:-]+\b/i);
    if (token?.[0]) return token[0];
  }

  const fromReason = alert.reason.match(/\b[0-9a-z._:-]{3,}\b/i);
  return fromReason?.[0] ?? null;
}

function machineIdFromTrace(row: AuditDecisionRecord): string | null {
  const machine = (row.machine_id ?? '').trim();
  if (machine.length > 0) return machine;
  const agent = row.agent_id.trim();
  return agent.length > 0 ? agent : null;
}

function buildPayloadBundle(row: AuditDecisionRecord): ActionPayloadBundle {
  const raw = toRecord(row.raw_trace);
  return {
    statePayload: readSegmentPayload(raw, ['state', 'state_snapshot']),
    signalPayload: readSegmentPayload(raw, ['signal', 'signals', 'signal_snapshot', 'inputs']),
    actionPayload: readSegmentPayload(raw, ['action_execution', 'action']),
    resultPayload: readSegmentPayload(raw, ['result', 'outcome'])
  };
}

function actionNameFromPayload(bundle: ActionPayloadBundle): string | null {
  const direct = pickString(bundle.actionPayload, [
    'action_name',
    'action',
    'action_label',
    'intervention',
    'what_changed',
    'system_change',
    'change_summary',
    'operation',
    'command',
    'kind',
    'title'
  ]);
  if (direct) return displayBreakLabel(direct) ?? humanizeAction(direct);

  const resultDirect = pickString(bundle.resultPayload, [
    'action_name',
    'action',
    'action_label',
    'intervention',
    'what_changed',
    'system_change',
    'change_summary'
  ]);
  if (resultDirect) return displayBreakLabel(resultDirect) ?? humanizeAction(resultDirect);

  const notificationsSuppressed = pickBoolean(bundle.resultPayload, ['notifications_suppressed']);
  if (notificationsSuppressed === true) return 'Notifications muted';
  if (notificationsSuppressed === false) return 'Notifications restored';

  const pendingBreakKind = normalizeBreakKind(pickString(bundle.actionPayload, ['break_pending_kind', 'breakPendingKind']));
  if (pendingBreakKind === 'short_break') return 'Short break';
  if (pendingBreakKind === 'long_break') return 'Long break';

  if (pickBoolean(bundle.actionPayload, ['break_suggestion']) === true || pickString(bundle.actionPayload, ['break_pending_action']) !== null) {
    return 'Break ready';
  }

  return null;
}

function actionTypeFromPayload(bundle: ActionPayloadBundle, actionName: string | null): OperationsActionType {
  const explicit = pickString(bundle.actionPayload, ['action_type', 'type'])?.toLowerCase()
    ?? pickString(bundle.resultPayload, ['action_type', 'type'])?.toLowerCase()
    ?? null;
  if (explicit?.includes('suggest')) return 'Suggestion';
  if (explicit?.includes('automatic') || explicit?.includes('change')) return 'Automatic change';

  if (actionName?.toLowerCase().includes('suggestion')) return 'Suggestion';
  if (pickBoolean(bundle.actionPayload, ['action_taken', 'applied', 'changed']) === true) return 'Automatic change';
  if (pickBoolean(bundle.resultPayload, ['action_taken', 'applied', 'changed']) === true) return 'Automatic change';
  if (pickString(bundle.actionPayload, ['system_change', 'what_changed', 'change_summary']) !== null) return 'Automatic change';
  if (pickString(bundle.resultPayload, ['system_change', 'what_changed', 'change_summary']) !== null) return 'Automatic change';

  return 'Unknown';
}

function actionResultFromPayload(bundle: ActionPayloadBundle): { result: OperationsActionResult; error: string | null } {
  const error = pickString(bundle.resultPayload, ['error', 'error_message', 'failure_reason', 'last_error'])
    ?? pickString(bundle.actionPayload, ['error', 'error_message', 'failure_reason', 'last_error'])
    ?? null;

  if (error) {
    return { result: 'Failed', error };
  }

  const status = pickString(bundle.resultPayload, ['status', 'result', 'outcome'])?.toLowerCase()
    ?? pickString(bundle.actionPayload, ['status', 'result', 'outcome'])?.toLowerCase()
    ?? null;
  if (status && ['done', 'success', 'succeeded', 'completed', 'applied'].includes(status)) {
    return { result: 'Done', error: null };
  }
  if (status && ['failed', 'error', 'blocked', 'rejected'].includes(status)) {
    return { result: 'Failed', error: null };
  }

  const success = pickBoolean(bundle.resultPayload, ['success', 'applied', 'done'])
    ?? pickBoolean(bundle.actionPayload, ['success', 'applied', 'done']);
  if (success === true) return { result: 'Done', error: null };
  if (success === false) return { result: 'Failed', error: null };

  return { result: 'Unknown', error: null };
}

function layer1Tone(input: {
  agentRunning: OperationsTruthLabel;
  userSessionConnected: OperationsTruthLabel;
  activityDetected: OperationsTruthLabel;
  errorMessage: string | null;
}): OperationsMachineHealth {
  if (input.agentRunning === 'No' || input.errorMessage) return 'critical';
  if (input.userSessionConnected === 'No' || input.activityDetected === 'No') return 'warning';
  if (input.userSessionConnected === 'Unknown' || input.activityDetected === 'Unknown') return 'warning';
  return 'healthy';
}

function parseStreamMachineState(payload: Record<string, unknown>): StreamMachineState | null {
  const machineId = pickString(payload, ['machine_id', 'machineId', 'agent_id', 'node_id']);
  if (!machineId) return null;

  const states = toRecord(payload.states);
  const signalPayload = toRecord(payload.signal ?? payload.signals ?? payload.signal_snapshot ?? payload.inputs);
  const dataQualityPayload = toRecord(payload.data_quality);
  const timestampUtc = pickString(payload, ['timestamp', 'timestamp_utc', 'at_utc']) ?? new Date().toISOString();
  const lastActivityAtUtc = newestTimestamp([
    pickString(payload, ['last_activity_utc', 'lastActivityUtc', 'last_input_event_utc', 'lastInputEventUtc']),
    pickString(signalPayload, ['last_activity_utc', 'lastActivityUtc', 'last_input_event_utc', 'lastInputEventUtc'])
  ]);
  const breakPendingAction = pickString(payload, ['break_pending_action', 'breakPendingAction']);
  const breakPendingKind = normalizeBreakKind(pickString(payload, ['break_pending_kind', 'breakPendingKind']) ?? breakPendingAction);

  return {
    machineId,
    machineName: pickString(payload, ['machine_name', 'machineName', 'hostname', 'device_name']),
    userId: pickString(payload, ['user_id', 'userId', 'session_user_id']),
    userName: pickString(payload, ['user_name', 'userName', 'username', 'session_user', 'display_name']),
    timestampUtc,
    lastSeenAtUtc: newestTimestamp([
      pickString(payload, ['last_seen_utc', 'lastSeenUtc']),
      timestampUtc
    ]),
    lastActivityAtUtc,
    agentRunning: pickBoolean(payload, ['agent_running', 'agentRunning']),
    sessionConnected: pickBoolean(payload, ['user_session_connected', 'session_connected', 'sessionConnected']),
    activityDetected: pickBoolean(payload, ['activity_detected', 'activityDetected']),
    focusScore: pickNumber(states, ['focus_strength', 'focus']),
    overloadScore: pickNumber(states, ['pressure_level', 'overload_likelihood', 'overload']),
    deepWorkActive: pickBoolean(payload, ['deep_work_active', 'deepWorkActive'])
      ?? pickBoolean(states, ['deep_work_active', 'deepWorkActive']),
    focusDurationSec: pickNumber(payload, [
      'focus_episode_seconds',
      'focusEpisodeSeconds',
      'task_continuity_seconds',
      'taskContinuitySeconds',
      'focus_duration_seconds',
      'focusDurationSeconds'
    ]) ?? pickNumber(states, [
      'focus_episode_seconds',
      'focusEpisodeSeconds',
      'task_continuity_seconds',
      'taskContinuitySeconds',
      'focus_duration_seconds',
      'focusDurationSeconds'
    ]),
    breakNeeded: pickBoolean(payload, ['break_needed', 'breakNeeded'])
      ?? (breakPendingKind !== null || breakPendingAction !== null ? true : null),
    attentionSegmentKind: pickString(payload, ['attention_segment_kind', 'attentionSegmentKind']),
    distractionEpisodeActive: pickBoolean(payload, ['distraction_episode_active', 'distractionEpisodeActive']),
    distractionEpisodeSeconds: pickNumber(payload, ['distraction_episode_seconds', 'distractionEpisodeSeconds']),
    attentionSegmentReasonCode: pickString(payload, ['attention_segment_reason_code', 'attentionSegmentReasonCode']),
    attentionSegmentReasonText: pickString(payload, ['attention_segment_reason_text', 'attentionSegmentReasonText']),
    confidenceScore: pickNumber(payload, ['pressure_confidence', 'model_confidence', 'confidence_score', 'confidence']),
    trustTier: pickString(payload, ['trust_tier', 'trustTier']),
    learningStage: pickString(payload, ['learning_stage', 'learningStage']),
    calibrationStage: pickString(payload, ['calibration_stage', 'calibrationStage']),
    baselineReady: pickBoolean(payload, ['baseline_ready', 'baselineReady']),
    coldStart: pickBoolean(payload, ['cold_start', 'coldStart']),
    qualityScore: pickNumber(payload, ['current_quality_score', 'quality_score', 'signal_quality_score'])
      ?? pickNumber(dataQualityPayload, ['score', 'quality_score']),
    partialData: pickBoolean(payload, ['partial_data', 'partialData'])
      ?? pickBoolean(dataQualityPayload, ['partial_data', 'partialData']),
    missingChannels: pickStringArray(payload, ['missing_major_channels', 'missingChannels']),
    errorMessage: pickString(payload, ['error', 'error_message', 'last_error', 'failure_reason'])
  };
}

function traceTimestamp(bundle: ActionPayloadBundle, fallback: string): string {
  return newestTimestamp([
    pickString(bundle.resultPayload, ['timestamp', 'timestamp_utc', 'occurred_at_utc']),
    pickString(bundle.actionPayload, ['timestamp', 'timestamp_utc', 'occurred_at_utc']),
    fallback
  ]) ?? fallback;
}

function traceStateSource(row: AuditDecisionRecord): {
  timestampUtc: string | null;
  userName: string | null;
  userId: string | null;
  sessionConnected: boolean | null;
  lastActivityAtUtc: string | null;
  activityDetected: boolean | null;
  focusScore: number | null;
  overloadScore: number | null;
  deepWorkActive: boolean | null;
  focusDurationSec: number | null;
  breakNeeded: boolean | null;
  attentionSegmentKind: string | null;
  distractionEpisodeActive: boolean | null;
  distractionEpisodeSeconds: number | null;
  attentionSegmentReasonCode: string | null;
  attentionSegmentReasonText: string | null;
  confidenceScore: number | null;
  trustTier: string | null;
  learningStage: string | null;
  calibrationStage: string | null;
  baselineReady: boolean | null;
  coldStart: boolean | null;
  qualityScore: number | null;
  partialData: boolean | null;
  missingChannels: string[];
  errorMessage: string | null;
} {
  const bundle = buildPayloadBundle(row);
  const statePayload = bundle.statePayload;
  const signalPayload = bundle.signalPayload;
  const timestampUtc = newestTimestamp([
    pickString(statePayload, ['timestamp', 'timestamp_utc', 'occurred_at_utc']),
    pickString(signalPayload, ['timestamp', 'timestamp_utc', 'occurred_at_utc']),
    row.timestamp
  ]);

  const breakPendingAction = pickString(statePayload, ['break_pending_action', 'breakPendingAction']);
  const breakPendingKind = normalizeBreakKind(pickString(statePayload, ['break_pending_kind', 'breakPendingKind']) ?? breakPendingAction);
  return {
    timestampUtc,
    userName: pickString(signalPayload, ['user_name', 'userName', 'username', 'session_user', 'display_name']),
    userId: pickString(signalPayload, ['user_id', 'userId', 'session_user_id']),
    sessionConnected: pickBoolean(signalPayload, ['user_session_connected', 'session_connected', 'sessionConnected']),
    lastActivityAtUtc: newestTimestamp([
      pickString(signalPayload, ['last_activity_utc', 'lastActivityUtc', 'last_input_event_utc', 'lastInputEventUtc']),
      pickString(statePayload, ['last_activity_utc', 'lastActivityUtc', 'last_input_event_utc', 'lastInputEventUtc'])
    ]),
    activityDetected: pickBoolean(signalPayload, ['activity_detected', 'activityDetected']),
    focusScore: pickNumber(statePayload, ['focus_strength', 'focus']),
    overloadScore: pickNumber(statePayload, ['pressure_level', 'overload_likelihood', 'overload']),
    deepWorkActive: pickBoolean(statePayload, ['deep_work_active', 'deepWorkActive']),
    focusDurationSec: pickNumber(statePayload, [
      'focus_episode_seconds',
      'focusEpisodeSeconds',
      'task_continuity_seconds',
      'taskContinuitySeconds',
      'focus_duration_seconds',
      'focusDurationSeconds'
    ]),
    breakNeeded: pickBoolean(statePayload, ['break_needed', 'breakNeeded'])
      ?? (breakPendingKind !== null || breakPendingAction !== null ? true : null),
    attentionSegmentKind: pickString(statePayload, ['attention_segment_kind', 'attentionSegmentKind']),
    distractionEpisodeActive: pickBoolean(statePayload, ['distraction_episode_active', 'distractionEpisodeActive']),
    distractionEpisodeSeconds: pickNumber(statePayload, ['distraction_episode_seconds', 'distractionEpisodeSeconds']),
    attentionSegmentReasonCode: pickString(statePayload, ['attention_segment_reason_code', 'attentionSegmentReasonCode']),
    attentionSegmentReasonText: pickString(statePayload, ['attention_segment_reason_text', 'attentionSegmentReasonText']),
    confidenceScore: parseNumber(row.confidence_score)
      ?? pickNumber(statePayload, ['pressure_confidence', 'model_confidence', 'confidence_score', 'confidence']),
    trustTier: pickString(statePayload, ['trust_tier', 'trustTier']),
    learningStage: pickString(statePayload, ['learning_stage', 'learningStage']),
    calibrationStage: pickString(statePayload, ['calibration_stage', 'calibrationStage']),
    baselineReady: pickBoolean(statePayload, ['baseline_ready', 'baselineReady']),
    coldStart: pickBoolean(statePayload, ['cold_start', 'coldStart']),
    qualityScore: pickNumber(statePayload, ['current_quality_score', 'quality_score', 'signal_quality_score']),
    partialData: pickBoolean(statePayload, ['partial_data', 'partialData']),
    missingChannels: pickStringArray(statePayload, ['missing_major_channels', 'missingChannels']),
    errorMessage: pickString(bundle.resultPayload, ['error', 'error_message', 'failure_reason', 'last_error'])
      ?? pickString(bundle.actionPayload, ['error', 'error_message', 'failure_reason', 'last_error'])
  };
}

function buildActionsForMachine(rows: AuditDecisionRecord[], machineName: string, userName: string): OperationsActionItem[] {
  const actions: OperationsActionItem[] = [];

  for (const row of rows) {
    const bundle = buildPayloadBundle(row);
    const actionName = actionNameFromPayload(bundle);
    if (!actionName) continue;

    const actionType = actionTypeFromPayload(bundle, actionName);
    const actionResult = actionResultFromPayload(bundle);
    actions.push({
      id: row.trace_id,
      machine: machineName,
      user: userName,
      actionName,
      actionType,
      result: actionResult.result,
      timeUtc: traceTimestamp(bundle, row.timestamp),
      error: actionResult.error
    });

    if (actions.length >= MAX_ACTIONS_PER_MACHINE) break;
  }

  return actions;
}

function machineHealthFromAlert(alerts: AlertRecord[]): string | null {
  const active = alerts.filter((alert) => alert.status === 'active');
  if (active.length === 0) return null;
  const sorted = [...active].sort((left, right) => Date.parse(right.last_seen_at) - Date.parse(left.last_seen_at));
  return sorted[0]?.reason ?? null;
}

export function useOperationsConsole(): {
  records: OperationsConsoleRecord[];
  loading: boolean;
  error: ApiError | undefined;
  lastRefreshUtc: string | undefined;
  streamConnected: boolean;
} {
  const [snapshotRows, setSnapshotRows] = useState<NodeSnapshotRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditDecisionRecord[]>([]);
  const [alertRows, setAlertRows] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [lastRefreshUtc, setLastRefreshUtc] = useState<string | undefined>(undefined);
  const [streamConnected, setStreamConnected] = useState(false);
  const streamStateRef = useRef<Record<string, StreamMachineState>>({});
  const wsBase = import.meta.env.VITE_WS_BASE_URL?.trim();

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      try {
        const [snapshot, audits, alerts] = await Promise.all([
          getNodeSnapshot(),
          fetchAuditDecisions(),
          fetchAlerts(true)
        ]);

        if (!mounted) return;
        setSnapshotRows(snapshot);
        setAuditRows(audits);
        setAlertRows(alerts);
        setLastRefreshUtc(new Date().toISOString());
        setError(undefined);
      } catch (nextError) {
        if (!mounted) return;
        setError(toApiError(nextError));
      } finally {
        if (mounted) setLoading(false);
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
    if (!wsBase) {
      setStreamConnected(false);
      return () => undefined;
    }

    let disposed = false;
    let reconnectTimer: number | undefined;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (disposed) return;
      let streamUrl: string;
      try {
        streamUrl = `${toWsBase(wsBase)}/v1/stream/console-state`;
        new URL(streamUrl);
      } catch {
        setStreamConnected(false);
        return;
      }

      ws = new WebSocket(streamUrl);

      ws.onopen = () => {
        if (disposed) return;
        setStreamConnected(true);
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
          const parsed = parseStreamMachineState(payload);
          if (!parsed) return;
          streamStateRef.current = {
            ...streamStateRef.current,
            [parsed.machineId]: parsed
          };
        } catch {
          // Ignore malformed realtime payloads; the snapshot poll remains authoritative.
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setStreamConnected(false);
        reconnectTimer = window.setTimeout(connect, 5_000);
      };

      ws.onerror = () => {
        setStreamConnected(false);
        ws?.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [wsBase]);

  const records = useMemo<OperationsConsoleRecord[]>(() => {
    const traceRowsByMachine = new Map<string, AuditDecisionRecord[]>();
    for (const row of auditRows) {
      const machineId = machineIdFromTrace(row);
      if (!machineId) continue;
      const bucket = traceRowsByMachine.get(machineId) ?? [];
      bucket.push(row);
      traceRowsByMachine.set(machineId, bucket);
    }

    for (const bucket of traceRowsByMachine.values()) {
      bucket.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
    }

    const alertRowsByMachine = new Map<string, AlertRecord[]>();
    for (const alert of alertRows) {
      const machineId = pickMachineIdFromAlert(alert);
      if (!machineId) continue;
      const bucket = alertRowsByMachine.get(machineId) ?? [];
      bucket.push(alert);
      alertRowsByMachine.set(machineId, bucket);
    }

    return [...snapshotRows]
      .sort((left, right) => Date.parse(right.last_heartbeat) - Date.parse(left.last_heartbeat))
      .map((row) => {
        const streamState = streamStateRef.current[row.node_id];
        const traces = traceRowsByMachine.get(row.node_id) ?? [];
        const alerts = alertRowsByMachine.get(row.node_id) ?? [];
        const latestTrace = traces[0];
        const traceSource = latestTrace ? traceStateSource(latestTrace) : null;
        const streamFresh = streamState ? isFresh(streamState.timestampUtc, STATE_FRESH_MS) : false;
        const traceFresh = traceSource?.timestampUtc ? isFresh(traceSource.timestampUtc, STATE_FRESH_MS) : false;
        const machineName = streamState?.machineName ?? row.node_id;
        const userName = streamState?.userName
          ?? traceSource?.userName
          ?? 'Unknown';
        const explicitLastActivity = newestTimestamp([
          streamState?.lastActivityAtUtc,
          traceSource?.lastActivityAtUtc
        ]);
        const activityDetectedBool = streamState?.activityDetected
          ?? traceSource?.activityDetected
          ?? (explicitLastActivity ? isFresh(explicitLastActivity, ACTIVITY_FRESH_MS) : null);
        const lastSeenAtUtc = newestTimestamp([
          row.last_heartbeat,
          streamState?.lastSeenAtUtc,
          streamFresh ? streamState?.timestampUtc : null
        ]);
        const agentRunningBool = streamState?.agentRunning ?? isFresh(row.last_heartbeat, HEARTBEAT_FRESH_MS);
        const userSessionConnectedBool = streamState?.sessionConnected ?? traceSource?.sessionConnected ?? null;
        const errorMessage = streamState?.errorMessage
          ?? traceSource?.errorMessage
          ?? machineHealthFromAlert(alerts);

        const layer1 = {
          machineName,
          userName,
          lastSeenAtUtc,
          agentRunning: toTruthLabel(agentRunningBool),
          userSessionConnected: toTruthLabel(userSessionConnectedBool),
          activityDetected: toTruthLabel(activityDetectedBool),
          lastActivityAtUtc: explicitLastActivity,
          errorMessage
        };

        const healthTone = layer1Tone(layer1);
        const reliabilityBlocked = healthTone === 'critical';

        const focusScore = streamFresh ? (streamState?.focusScore ?? null) : (traceFresh ? (traceSource?.focusScore ?? null) : null);
        const overloadScore = streamFresh ? (streamState?.overloadScore ?? null) : (traceFresh ? (traceSource?.overloadScore ?? null) : null);
        const deepWorkActive = streamFresh ? (streamState?.deepWorkActive ?? null) : (traceFresh ? (traceSource?.deepWorkActive ?? null) : null);
        const focusDurationSec = streamFresh ? (streamState?.focusDurationSec ?? null) : (traceFresh ? (traceSource?.focusDurationSec ?? null) : null);
        const breakNeeded = streamFresh ? (streamState?.breakNeeded ?? null) : (traceFresh ? (traceSource?.breakNeeded ?? null) : null);
        const attentionSegmentKind = streamFresh ? (streamState?.attentionSegmentKind ?? null) : (traceFresh ? (traceSource?.attentionSegmentKind ?? null) : null);
        const distractionEpisodeActive = streamFresh ? (streamState?.distractionEpisodeActive ?? null) : (traceFresh ? (traceSource?.distractionEpisodeActive ?? null) : null);
        const distractionEpisodeSeconds = streamFresh ? (streamState?.distractionEpisodeSeconds ?? null) : (traceFresh ? (traceSource?.distractionEpisodeSeconds ?? null) : null);
        const attentionSegmentReasonText = streamFresh ? (streamState?.attentionSegmentReasonText ?? null) : (traceFresh ? (traceSource?.attentionSegmentReasonText ?? null) : null);

        const layer2 = {
          focusLevel: focusLabel(focusScore),
          deepWork: actionActivityLabel(deepWorkActive),
          overloadRisk: riskLabel(overloadScore),
          focusDurationSec,
          breakNeeded: toTruthLabel(breakNeeded),
          attentionSegmentKind,
          distractionEpisodeActive,
          distractionEpisodeSeconds,
          attentionSegmentReasonText
        };

        const learningStage = learningStageLabel({
          explicit: streamState?.learningStage ?? traceSource?.learningStage ?? null,
          calibrationStage: streamState?.calibrationStage ?? traceSource?.calibrationStage ?? null,
          baselineReady: streamState?.baselineReady ?? traceSource?.baselineReady ?? null,
          coldStart: streamState?.coldStart ?? traceSource?.coldStart ?? null
        });
        const confidence = confidenceLabel(
          streamState?.confidenceScore ?? traceSource?.confidenceScore ?? null,
          streamState?.trustTier ?? traceSource?.trustTier ?? null
        );
        const hasStateTruth = streamFresh || traceFresh;
        const layer3 = {
          learningStage,
          confidence,
          dataQuality: dataQualityLabel({
            qualityScore: streamState?.qualityScore ?? traceSource?.qualityScore ?? null,
            partialData: streamState?.partialData ?? traceSource?.partialData ?? null,
            missingChannels: streamState?.missingChannels ?? traceSource?.missingChannels ?? [],
            layer1Blocked: reliabilityBlocked,
            hasStateTruth
          })
        };

        const actions = buildActionsForMachine(traces, machineName, userName);

        return {
          machineId: row.node_id,
          machineName,
          userName,
          lastRefreshUtc: lastRefreshUtc ?? new Date().toISOString(),
          healthTone,
          reliabilityBlocked,
          layer1,
          layer2,
          layer3,
          actions,
          sources: {
            snapshot: true,
            stream: streamFresh,
            traces: traces.length,
            alerts: alerts.length
          }
        } satisfies OperationsConsoleRecord;
      });
  }, [alertRows, auditRows, lastRefreshUtc, snapshotRows]);

  return useMemo(
    () => ({
      records,
      loading,
      error,
      lastRefreshUtc,
      streamConnected
    }),
    [error, lastRefreshUtc, loading, records, streamConnected]
  );
}
