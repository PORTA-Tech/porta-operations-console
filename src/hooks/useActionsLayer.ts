import { useEffect, useMemo, useState } from 'react';
import { toApiError, type ApiError } from '../api/client';
import { fetchAuditDecisions } from '../api/operations';
import type { ActionsRecord } from '../types/actionsLayer';
import type { AuditDecisionRecord } from '../types/consoleOperations';
import { describeActionError, resolveCatalogAction, resolveTerminalResult } from '../utils/actionCatalog';

interface ActionPayloadBundle {
  root: Record<string, unknown>;
  statePayload: Record<string, unknown>;
  signalPayload: Record<string, unknown>;
  actionPayload: Record<string, unknown>;
  resultPayload: Record<string, unknown>;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = parseString(record[key]);
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

function readSegmentPayload(raw: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const candidate = toRecord(raw[key]);
    if (Object.keys(candidate).length > 0) return candidate;
  }
  return {};
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

function machineIdFromTrace(row: AuditDecisionRecord): string | null {
  const machineId = (row.machine_id ?? '').trim();
  if (machineId.length > 0) return machineId;
  const agentId = row.agent_id.trim();
  return agentId.length > 0 ? agentId : null;
}

function buildPayloadBundle(row: AuditDecisionRecord): ActionPayloadBundle {
  const root = toRecord(row.raw_trace);
  return {
    root,
    statePayload: readSegmentPayload(root, ['state', 'state_snapshot']),
    signalPayload: readSegmentPayload(root, ['signal', 'signals', 'signal_snapshot', 'inputs']),
    actionPayload: readSegmentPayload(root, ['action_execution', 'action', 'intervention', 'command']),
    resultPayload: readSegmentPayload(root, ['result', 'outcome', 'execution', 'execution_result', 'ack'])
  };
}

function machineNameFromBundle(bundle: ActionPayloadBundle, machineId: string | null): string {
  const records = [bundle.root, bundle.signalPayload, bundle.statePayload, bundle.actionPayload, bundle.resultPayload];
  const machineName = pickStringFromRecords(records, ['machine_name', 'machineName', 'hostname', 'device_name']);
  return machineName ?? machineId ?? 'Unknown machine';
}

function userNameFromBundle(bundle: ActionPayloadBundle): string {
  const records = [bundle.resultPayload, bundle.actionPayload, bundle.signalPayload, bundle.statePayload, bundle.root];
  const userName = pickStringFromRecords(records, [
    'user_name',
    'userName',
    'username',
    'session_user',
    'session_user_name',
    'active_user_name',
    'display_name'
  ]);
  return userName ?? 'Unknown user';
}

function actionIdentityFromBundle(bundle: ActionPayloadBundle): { actionCode: string | null; commandType: string | null } {
  const records = [bundle.resultPayload, bundle.actionPayload, bundle.root];
  return {
    actionCode: pickStringFromRecords(records, ['action', 'action_name', 'action_code', 'intervention', 'kind']),
    commandType: pickStringFromRecords(records, ['command_type', 'commandType'])
  };
}

function terminalStateFromBundle(bundle: ActionPayloadBundle): { result: 'Done' | 'Failed'; timeUtc: string | null; errorMessage: string | null } | null {
  const records = [bundle.resultPayload, bundle.actionPayload, bundle.root];
  const explicitState = pickStringFromRecords(records, ['execution_state', 'executionState', 'result', 'outcome', 'status']);
  const terminal = resolveTerminalResult(explicitState);

  if (!terminal) {
    return null;
  }

  const appliedAtUtc = pickStringFromRecords(records, ['applied_at_utc', 'appliedAtUtc']);
  const ackedAtUtc = pickStringFromRecords(records, ['acked_at_utc', 'ackedAtUtc']);
  const timestampUtc = newestTimestamp([
    pickStringFromRecords(records, ['timestamp', 'timestamp_utc', 'occurred_at_utc']),
    bundle.root ? pickString(bundle.root, ['timestamp', 'timestamp_utc', 'occurred_at_utc']) : null
  ]);
  const timeUtc = terminal.timePreference === 'applied'
    ? newestTimestamp([appliedAtUtc, ackedAtUtc, timestampUtc])
    : newestTimestamp([ackedAtUtc, appliedAtUtc, timestampUtc]);
  const rawError = pickStringFromRecords(records, [
    'execution_error_code',
    'executionErrorCode',
    'error_code',
    'errorCode',
    'error',
    'error_message',
    'failure_reason',
    'last_error'
  ]);

  return {
    result: terminal.result,
    timeUtc,
    errorMessage: terminal.result === 'Failed' ? describeActionError(rawError) : null
  };
}

function recordFromTrace(row: AuditDecisionRecord): ActionsRecord | null {
  const bundle = buildPayloadBundle(row);
  const identity = actionIdentityFromBundle(bundle);
  const action = resolveCatalogAction(identity);
  if (!action) return null;

  const terminal = terminalStateFromBundle(bundle);
  if (!terminal) return null;

  const machineId = machineIdFromTrace(row);
  return {
    id: row.trace_id,
    machineName: machineNameFromBundle(bundle, machineId),
    userName: userNameFromBundle(bundle),
    actionName: action.actionName,
    actionType: action.actionType,
    result: terminal.result,
    timeUtc: terminal.timeUtc ?? row.timestamp,
    errorMessage: terminal.errorMessage
  } satisfies ActionsRecord;
}

export function useActionsLayer(): {
  records: ActionsRecord[];
  loading: boolean;
  error: ApiError | undefined;
  lastRefreshUtc: string | undefined;
  notices: string[];
} {
  const [auditRows, setAuditRows] = useState<AuditDecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [lastRefreshUtc, setLastRefreshUtc] = useState<string | undefined>(undefined);
  const [notices, setNotices] = useState<string[]>([]);

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
        setNotices([`Action trace feed unavailable: ${toApiError(nextError).message}`]);
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

  const records = useMemo(() => (
    auditRows
      .map(recordFromTrace)
      .filter((row): row is ActionsRecord => row !== null)
      .sort((left, right) => (parseTimestamp(right.timeUtc) ?? 0) - (parseTimestamp(left.timeUtc) ?? 0))
  ), [auditRows]);

  const mergedNotices = useMemo(() => {
    if (notices.length > 0) return notices;
    if (loading) return [];
    if (auditRows.length > 0 && records.length === 0) {
      return ['No verified terminal action outcomes were found. Layer 4 omits decision-only records until execution completion or failure is authoritative.'];
    }
    return [];
  }, [auditRows.length, loading, notices, records.length]);

  return useMemo(
    () => ({
      records,
      loading,
      error,
      lastRefreshUtc,
      notices: mergedNotices
    }),
    [error, lastRefreshUtc, loading, mergedNotices, records]
  );
}
