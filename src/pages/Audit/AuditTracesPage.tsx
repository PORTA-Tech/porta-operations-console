import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { useConsoleOperations } from '../../hooks/useConsoleOperations';
import { getNodeSnapshot } from '../../api/nodes';
import { useWsConnectionStatus } from '../../hooks/useWsConnectionStatus';
import { useAuditLedgerView } from '../../hooks/useAuditLedgerView';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';
import type { AuditDecisionRecord } from '../../types/consoleOperations';

type DecisionFilter = 'all' | 'intervene' | 'skip' | 'cooldown' | 'blocked';
type TimeWindow = '15m' | '1h' | '24h' | 'custom';
type TraceStatusFilter = 'all' | 'complete' | 'incomplete';
type SignatureStatusFilter = 'all' | 'verified' | 'failed' | 'not_verified';
type TelemetryStatus = 'OFF' | 'ON_EMPTY' | 'ON_WITH_DATA';

const WINDOW_MS: Record<Exclude<TimeWindow, 'custom'>, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000
};

const REQUIRED_SEGMENTS = [
  'Signal',
  'Primitives',
  'State',
  'Policy evaluation',
  'Escalation decision',
  'Action execution',
  'Result'
] as const;

interface TraceSegmentView {
  key: string;
  title: (typeof REQUIRED_SEGMENTS)[number];
  timestamp: string | null;
  payload: unknown;
  confidence: number | null;
  contributors: string[];
  signatureStatus: string | null;
}

function parseTimeWindow(raw: string | null): TimeWindow {
  if (raw === '15m' || raw === '1h' || raw === '24h' || raw === 'custom') return raw;
  return '1h';
}

function parseDecisionFilter(raw: string | null): DecisionFilter {
  if (raw === 'intervene' || raw === 'skip' || raw === 'cooldown' || raw === 'blocked') return raw;
  return 'all';
}

function parseTraceStatusFilter(raw: string | null): TraceStatusFilter {
  if (raw === 'complete' || raw === 'incomplete') return raw;
  return 'all';
}

function parseSignatureStatusFilter(raw: string | null): SignatureStatusFilter {
  if (raw === 'verified' || raw === 'failed' || raw === 'not_verified') return raw;
  return 'all';
}

function toMs(iso: string): number | null {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDecisionLabel(value: AuditDecisionRecord['action_decision']): string {
  if (value === 'intervene') return 'Allow';
  if (value === 'blocked') return 'Block';
  if (value === 'cooldown') return 'Nudge';
  if (value === 'skip') return 'No-op';
  return 'Unknown';
}

function toTrustLabel(row: AuditDecisionRecord): 'valid' | 'invalid' | 'unknown' {
  if (row.signature_status === 'VALID') return 'valid';
  if (row.signature_status === 'INVALID') return 'invalid';
  return 'unknown';
}

function normalizeTraceStatus(row: AuditDecisionRecord): 'complete' | 'incomplete' | 'unknown' {
  if (row.trace_status === 'complete' || row.trace_status === 'incomplete') return row.trace_status;
  if ((row.missing_segments?.length ?? 0) > 0) return 'incomplete';
  return 'unknown';
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readSegmentPayload(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (hasOwn(raw, key) && raw[key] != null) {
      return raw[key];
    }
  }
  return null;
}

function readSegmentTimestamp(payload: unknown): string | null {
  const record = asRecord(payload);
  const candidate = record.timestamp ?? record.timestamp_utc ?? record.occurred_at_utc;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function buildTraceSegments(row: AuditDecisionRecord): TraceSegmentView[] {
  const raw = asRecord(row.raw_trace);
  const signalPayload = readSegmentPayload(raw, ['signal', 'signals', 'signal_snapshot', 'inputs']);
  const primitivesPayload = readSegmentPayload(raw, ['primitives', 'metrics_snapshot']);
  const statePayload = readSegmentPayload(raw, ['state', 'state_snapshot']);
  const policyPayload = readSegmentPayload(raw, ['policy_evaluation', 'policy']);
  const escalationPayload = readSegmentPayload(raw, ['escalation_decision', 'escalation']);
  const actionPayload = readSegmentPayload(raw, ['action_execution', 'action']);
  const resultPayload = readSegmentPayload(raw, ['result', 'outcome']);
  const confidence = hasOwn(raw, 'confidence_score') && typeof raw.confidence_score === 'number'
    ? raw.confidence_score
    : null;
  const signatureStatus = row.signature_verification_status ?? null;

  return [
    { key: 'signal', title: 'Signal', timestamp: readSegmentTimestamp(signalPayload) ?? row.timestamp, payload: signalPayload, confidence: null, contributors: [], signatureStatus },
    { key: 'primitives', title: 'Primitives', timestamp: readSegmentTimestamp(primitivesPayload) ?? row.timestamp, payload: primitivesPayload, confidence: null, contributors: row.contributing_primitives, signatureStatus },
    { key: 'state', title: 'State', timestamp: readSegmentTimestamp(statePayload) ?? row.timestamp, payload: statePayload, confidence, contributors: [], signatureStatus },
    { key: 'policy', title: 'Policy evaluation', timestamp: readSegmentTimestamp(policyPayload) ?? row.timestamp, payload: policyPayload ?? { policy_id: row.policy_id, reason_code: (row.reason_code ?? row.triggered_by) || null }, confidence: null, contributors: [], signatureStatus },
    { key: 'escalation', title: 'Escalation decision', timestamp: readSegmentTimestamp(escalationPayload) ?? row.timestamp, payload: escalationPayload ?? { escalation_level: row.escalation_level ?? 'n/a' }, confidence: null, contributors: [], signatureStatus },
    { key: 'action', title: 'Action execution', timestamp: readSegmentTimestamp(actionPayload) ?? row.timestamp, payload: actionPayload ?? { decision: row.action_decision }, confidence: null, contributors: [], signatureStatus },
    { key: 'result', title: 'Result', timestamp: readSegmentTimestamp(resultPayload) ?? row.timestamp, payload: resultPayload, confidence: null, contributors: [], signatureStatus }
  ];
}

function summarizeTriggeredBy(row: AuditDecisionRecord): string {
  const code = row.reason_code ?? row.triggered_by ?? '';
  if (!code) return 'No trigger reason reported.';
  if (code === 'INSUFFICIENT_CONFIDENCE') return 'Decision blocked because confidence was below threshold.';
  if (code === 'COOLDOWN_ACTIVE') return 'Decision blocked by active cooldown.';
  if (code === 'FEATURE_DISABLED') return 'Feature gate disabled this decision path.';
  if (code === 'POLICY_BLOCKED_BY_MAX_ESCALATION') return 'Policy max escalation prevented action.';
  if (code === 'DATA_QUALITY_TOO_LOW') return 'Data quality gates blocked policy action.';
  if (code === 'THRESHOLD_CROSSED') return 'Policy threshold was crossed.';
  return code;
}

function downloadJson(name: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export function AuditTracesPage() {
  const [params, setParams] = useSearchParams();
  const { audits, policies, loading, error, replay, exportRows } = useConsoleOperations();
  const wsStatus = useWsConnectionStatus();
  const ledger = useAuditLedgerView();

  const [policyFilter, setPolicyFilter] = useState(params.get('policy') ?? 'all');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>(parseDecisionFilter(params.get('decision')));
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(parseTimeWindow(params.get('window')));
  const [customFrom, setCustomFrom] = useState(params.get('from') ?? '');
  const [customTo, setCustomTo] = useState(params.get('to') ?? '');
  const [cohortFilter, setCohortFilter] = useState(params.get('cohort') ?? 'all');
  const [machineFilter, setMachineFilter] = useState(params.get('machine') ?? params.get('agent') ?? '');
  const [reasonCodeFilter, setReasonCodeFilter] = useState(params.get('reason') ?? '');
  const [traceFocus, setTraceFocus] = useState(params.get('trace') ?? '');
  const [correlationFilter, setCorrelationFilter] = useState(params.get('correlation') ?? '');
  const [confidenceMin, setConfidenceMin] = useState(Number(params.get('confidence') ?? '0'));
  const [escalationFilter, setEscalationFilter] = useState(params.get('escalation') ?? 'all');
  const [configVersionFilter, setConfigVersionFilter] = useState(params.get('config') ?? '');
  const [traceStatusFilter, setTraceStatusFilter] = useState<TraceStatusFilter>(parseTraceStatusFilter(params.get('traceStatus')));
  const [signatureStatusFilter, setSignatureStatusFilter] = useState<SignatureStatusFilter>(parseSignatureStatusFilter(params.get('signatureStatus')));
  const [onlyWithReplayEvidence, setOnlyWithReplayEvidence] = useState(params.get('replayOnly') === '1');
  const [selectedTraceIds, setSelectedTraceIds] = useState<string[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | undefined>(undefined);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayResult, setReplayResult] = useState<{ result: 'match' | 'mismatch'; details: string } | undefined>();
  const [replayError, setReplayError] = useState<string | undefined>();
  const [actionMessage, setActionMessage] = useState('');
  const [agentCohortMap, setAgentCohortMap] = useState<Record<string, string>>({});
  const [cohortOptions, setCohortOptions] = useState<string[]>([]);

  useEffect(() => {
    setPolicyFilter(params.get('policy') ?? 'all');
    setDecisionFilter(parseDecisionFilter(params.get('decision')));
    setTimeWindow(parseTimeWindow(params.get('window')));
    setCustomFrom(params.get('from') ?? '');
    setCustomTo(params.get('to') ?? '');
    setCohortFilter(params.get('cohort') ?? 'all');
    setMachineFilter(params.get('machine') ?? params.get('agent') ?? '');
    setReasonCodeFilter(params.get('reason') ?? '');
    setTraceFocus(params.get('trace') ?? '');
    setCorrelationFilter(params.get('correlation') ?? '');
    setConfidenceMin(Number(params.get('confidence') ?? '0'));
    setEscalationFilter(params.get('escalation') ?? 'all');
    setConfigVersionFilter(params.get('config') ?? '');
    setTraceStatusFilter(parseTraceStatusFilter(params.get('traceStatus')));
    setSignatureStatusFilter(parseSignatureStatusFilter(params.get('signatureStatus')));
    setOnlyWithReplayEvidence(params.get('replayOnly') === '1');
  }, [params]);

  useEffect(() => {
    let mounted = true;
    const refreshNodeMap = async () => {
      try {
        const snapshot = await getNodeSnapshot();
        if (!mounted) return;
        const map: Record<string, string> = {};
        const cohorts = new Set<string>();
        for (const row of snapshot) {
          map[row.node_id] = row.cohort;
          cohorts.add(row.cohort);
        }
        setAgentCohortMap(map);
        setCohortOptions([...cohorts].sort());
      } catch {
        if (!mounted) return;
      }
    };
    void refreshNodeMap();
    const timer = window.setInterval(() => {
      void refreshNodeMap();
    }, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const updateParam = (key: string, value: string, clearValue?: string) => {
    const next = new URLSearchParams(params);
    if (value === '' || (clearValue && value === clearValue)) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const inSelectedWindow = (timestamp: string): boolean => {
    const ts = toMs(timestamp);
    if (ts === null) return false;
    if (timeWindow === 'custom') {
      const fromMs = customFrom ? toMs(new Date(customFrom).toISOString()) : null;
      const toMsValue = customTo ? toMs(new Date(customTo).toISOString()) : null;
      if (fromMs !== null && ts < fromMs) return false;
      if (toMsValue !== null && ts > toMsValue) return false;
      return true;
    }
    const horizonMs = WINDOW_MS[timeWindow];
    return Date.now() - ts <= horizonMs;
  };

  const windowRows = useMemo(() => audits.filter((row) => inSelectedWindow(row.timestamp)), [audits, timeWindow, customFrom, customTo]);

  const telemetryStatus: TelemetryStatus = audits.length === 0
    ? 'OFF'
    : windowRows.length === 0
      ? 'ON_EMPTY'
      : 'ON_WITH_DATA';

  const escalationOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of audits) {
      if (row.escalation_level) values.add(row.escalation_level);
    }
    return [...values].sort();
  }, [audits]);

  const filtered = useMemo(() => {
    return windowRows.filter((row) => {
      const cohort = row.cohort_id ?? agentCohortMap[row.agent_id] ?? null;
      const machine = row.machine_id ?? row.agent_id;
      const traceStatus = normalizeTraceStatus(row);
      const signatureStatus = row.signature_verification_status ?? 'not_verified';
      const configVersion = row.config_version;
      if (policyFilter !== 'all' && row.policy_id !== policyFilter) return false;
      if (decisionFilter !== 'all' && row.action_decision !== decisionFilter) return false;
      if (cohortFilter !== 'all' && cohort !== cohortFilter) return false;
      if (machineFilter.trim().length > 0 && !machine.toLowerCase().includes(machineFilter.trim().toLowerCase())) return false;
      if (reasonCodeFilter.trim().length > 0) {
        const reasonText = (row.reason_code ?? row.triggered_by ?? '').toLowerCase();
        if (!reasonText.includes(reasonCodeFilter.trim().toLowerCase())) return false;
      }
      if (traceFocus.trim().length > 0 && row.trace_id !== traceFocus.trim()) return false;
      if (correlationFilter.trim().length > 0 && row.correlation_id !== correlationFilter.trim()) return false;
      if (row.confidence_score < confidenceMin) return false;
      if (escalationFilter !== 'all' && (row.escalation_level ?? 'unknown') !== escalationFilter) return false;
      if (traceStatusFilter !== 'all' && traceStatus !== traceStatusFilter) return false;
      if (signatureStatusFilter !== 'all' && signatureStatus !== signatureStatusFilter) return false;
      if (configVersionFilter.trim().length > 0) {
        const requested = Number(configVersionFilter);
        if (!Number.isFinite(requested) || configVersion !== requested) return false;
      }
      if (onlyWithReplayEvidence && !row.evidence_available) return false;
      return true;
    });
  }, [
    windowRows,
    agentCohortMap,
    policyFilter,
    decisionFilter,
    cohortFilter,
    machineFilter,
    reasonCodeFilter,
    traceFocus,
    correlationFilter,
    confidenceMin,
    escalationFilter,
    traceStatusFilter,
    signatureStatusFilter,
    configVersionFilter,
    onlyWithReplayEvidence
  ]);

  const selectedTrace = useMemo(
    () => filtered.find((row) => row.trace_id === selectedTraceId) ?? audits.find((row) => row.trace_id === selectedTraceId),
    [filtered, audits, selectedTraceId]
  );

  useEffect(() => {
    if (!selectedTraceId && filtered.length > 0) {
      setSelectedTraceId(filtered[0]?.trace_id || undefined);
    }
  }, [filtered, selectedTraceId]);

  useEffect(() => {
    const traceIds = new Set(filtered.map((row) => row.trace_id));
    setSelectedTraceIds((current) => current.filter((id) => traceIds.has(id)));
  }, [filtered]);

  const selectedRows = useMemo(
    () => filtered.filter((row) => selectedTraceIds.includes(row.trace_id)),
    [filtered, selectedTraceIds]
  );

  const toggleSelected = (traceId: string) => {
    setSelectedTraceIds((current) => (current.includes(traceId)
      ? current.filter((id) => id !== traceId)
      : [...current, traceId]));
  };

  const toggleSelectAllFiltered = () => {
    if (filtered.length === 0) return;
    const allSelected = filtered.every((row) => selectedTraceIds.includes(row.trace_id));
    if (allSelected) {
      setSelectedTraceIds((current) => current.filter((id) => !filtered.some((row) => row.trace_id === id)));
      return;
    }
    const next = new Set(selectedTraceIds);
    for (const row of filtered) next.add(row.trace_id);
    setSelectedTraceIds([...next]);
  };

  const decisionBaseSampleSize = useMemo(() => {
    return new Set(filtered.map((row) => row.machine_id ?? row.agent_id)).size;
  }, [filtered]);

  const lastDecisionTs = useMemo(() => {
    const timestamps = windowRows
      .map((row) => row.timestamp)
      .map((iso) => toMs(iso))
      .filter((value): value is number => value !== null)
      .sort((a, b) => b - a);
    const latest = timestamps[0];
    return latest !== undefined ? new Date(latest).toISOString() : undefined;
  }, [windowRows]);

  const coveragePct = useMemo(() => {
    const eligible = Object.keys(agentCohortMap).length;
    if (eligible <= 0) return null;
    return Math.round((decisionBaseSampleSize / eligible) * 1000) / 10;
  }, [agentCohortMap, decisionBaseSampleSize]);

  const replaySelected = async (row: AuditDecisionRecord): Promise<void> => {
    setSelectedTraceId(row.trace_id);
    setReplayLoading(true);
    setReplayResult(undefined);
    setReplayError(undefined);
    try {
      const result = await replay(row.trace_id);
      setReplayResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setReplayError(message);
    } finally {
      setReplayLoading(false);
    }
  };

  const exportTracePack = () => {
    if (selectedRows.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadJson(`audit-trace-pack-${stamp}.json`, {
      generated_at_utc: new Date().toISOString(),
      filters: {
        policyFilter,
        decisionFilter,
        timeWindow,
        customFrom,
        customTo,
        cohortFilter,
        machineFilter,
        reasonCodeFilter,
        confidenceMin,
        escalationFilter,
        configVersionFilter,
        traceStatusFilter,
        signatureStatusFilter
      },
      traces: selectedRows.map((row) => ({
        trace_id: row.trace_id,
        correlation_id: row.correlation_id,
        policy_id: row.policy_id,
        policy_version: row.policy_version ?? null,
        config_version: row.config_version ?? null,
        signature_verification_status: row.signature_verification_status ?? 'not_verified',
        trace_status: normalizeTraceStatus(row),
        missing_segments: row.missing_segments ?? [],
        machine_id: row.machine_id ?? row.agent_id,
        cohort_id: row.cohort_id ?? agentCohortMap[row.agent_id] ?? null,
        raw_trace: row.raw_trace ?? null
      }))
    });
    setActionMessage(`Trace pack exported (${selectedRows.length} traces).`);
  };

  const clearFilters = () => {
    setPolicyFilter('all');
    setDecisionFilter('all');
    setTimeWindow('1h');
    setCustomFrom('');
    setCustomTo('');
    setCohortFilter('all');
    setMachineFilter('');
    setReasonCodeFilter('');
    setTraceFocus('');
    setCorrelationFilter('');
    setConfidenceMin(0);
    setEscalationFilter('all');
    setConfigVersionFilter('');
    setTraceStatusFilter('all');
    setSignatureStatusFilter('all');
    setOnlyWithReplayEvidence(false);
    setParams(new URLSearchParams(), { replace: true });
  };

  const switchTo24h = () => {
    setTimeWindow('24h');
    updateParam('window', '24h', '1h');
  };

  const enableRealtime = () => {
    if (wsStatus.statusLabel === 'Disabled') {
      setActionMessage('Realtime channel is not configured in this environment.');
      return;
    }
    setActionMessage('Realtime reconnect requested. If stream stays disconnected, check WS endpoint and auth.');
    window.location.reload();
  };

  const emptyReasons = useMemo(() => {
    const reasons: string[] = [];
    if (Object.keys(agentCohortMap).length === 0) reasons.push('No agents connected');
    const activePolicies = policies.filter((policy) => policy.active_flag).length;
    if (activePolicies === 0) reasons.push('No policies active');
    if (confidenceMin > 0) reasons.push('Confidence filter too high');
    if (timeWindow === '15m' && audits.length > 0 && windowRows.length === 0) reasons.push('Time window too narrow');
    if (reasons.length === 0) reasons.push('No traces reported for the selected filters');
    return reasons;
  }, [agentCohortMap, policies, confidenceMin, timeWindow, audits, windowRows.length]);

  const traceSegments = useMemo(() => (selectedTrace ? buildTraceSegments(selectedTrace) : []), [selectedTrace]);
  const missingSegments = useMemo(() => {
    if (!selectedTrace) return [];
    if ((selectedTrace.missing_segments?.length ?? 0) > 0) return selectedTrace.missing_segments ?? [];
    const missing = traceSegments
      .filter((segment) => segment.payload == null)
      .map((segment) => segment.title);
    return missing;
  }, [selectedTrace, traceSegments]);

  const likelyMissingReasons = useMemo(() => {
    if (!selectedTrace || missingSegments.length === 0) return [];
    const reasons: string[] = [];
    if (wsStatus.statusLabel !== 'Connected') reasons.push('Realtime disabled or disconnected');
    if (!agentCohortMap[selectedTrace.agent_id]) reasons.push('Agent lost connection');
    const raw = asRecord(selectedTrace.raw_trace);
    if (typeof raw.error === 'string' || typeof raw.failure_reason === 'string') reasons.push('Policy engine reported a processing failure');
    if (reasons.length === 0) reasons.push('Segment dropped');
    return reasons;
  }, [selectedTrace, missingSegments, wsStatus.statusLabel, agentCohortMap]);

  return (
    <div className="stack">
      <Panel title="Audit ledger and trace replay">
        {loading ? <p className="muted-line">Loading traces...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

        {wsStatus.statusLabel !== 'Connected' ? (
          <p className="focus-banner">
            Realtime {wsStatus.statusLabel.toLowerCase()} - showing last indexed results via polling mode.
            {' '}
            Last indexed trace: <strong>{formatUtc(lastDecisionTs)}</strong>.
          </p>
        ) : (
          <p className="muted-line">Realtime connected. New traces stream in without refresh.</p>
        )}

        <div className="table-controls">
          <label>
            Time window
            <select
              value={timeWindow}
              onChange={(event) => {
                const next = parseTimeWindow(event.target.value);
                setTimeWindow(next);
                updateParam('window', next, '1h');
              }}
            >
              <option value="15m">Last 15m</option>
              <option value="1h">Last 1h</option>
              <option value="24h">Last 24h</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {timeWindow === 'custom' ? (
            <>
              <label>
                From
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(event) => {
                    setCustomFrom(event.target.value);
                    updateParam('from', event.target.value);
                  }}
                />
              </label>
              <label>
                To
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={(event) => {
                    setCustomTo(event.target.value);
                    updateParam('to', event.target.value);
                  }}
                />
              </label>
            </>
          ) : null}
          <label>
            Cohort
            <select
              value={cohortFilter}
              onChange={(event) => {
                setCohortFilter(event.target.value);
                updateParam('cohort', event.target.value, 'all');
              }}
            >
              <option value="all">All cohorts</option>
              {cohortOptions.map((cohort) => (
                <option key={cohort} value={cohort}>{cohort}</option>
              ))}
            </select>
          </label>
          <label>
            Machine ID
            <input
              className="table-search-input"
              value={machineFilter}
              onChange={(event) => {
                setMachineFilter(event.target.value);
                updateParam('machine', event.target.value);
              }}
            />
          </label>
          <label>
            Policy
            <select
              value={policyFilter}
              onChange={(event) => {
                setPolicyFilter(event.target.value);
                updateParam('policy', event.target.value, 'all');
              }}
            >
              <option value="all">All policies</option>
              {policies.map((policy) => (
                <option key={policy.policy_id} value={policy.policy_id}>{policy.name}</option>
              ))}
            </select>
          </label>
          <label>
            Decision
            <select
              value={decisionFilter}
              onChange={(event) => {
                const next = parseDecisionFilter(event.target.value);
                setDecisionFilter(next);
                updateParam('decision', next, 'all');
              }}
            >
              <option value="all">All</option>
              <option value="intervene">allow/intervene</option>
              <option value="blocked">block</option>
              <option value="cooldown">nudge/cooldown</option>
              <option value="skip">no-op</option>
            </select>
          </label>
          <label>
            Escalation
            <select
              value={escalationFilter}
              onChange={(event) => {
                setEscalationFilter(event.target.value);
                updateParam('escalation', event.target.value, 'all');
              }}
            >
              <option value="all">All</option>
              {escalationOptions.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </label>
          <label>
            Confidence &gt;=
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={confidenceMin}
              onChange={(event) => {
                const next = Number(event.target.value);
                setConfidenceMin(next);
                updateParam('confidence', String(next), '0');
              }}
            />
            <span>{confidenceMin.toFixed(2)}</span>
          </label>
          <label>
            Config version
            <input
              className="table-search-input"
              value={configVersionFilter}
              onChange={(event) => {
                setConfigVersionFilter(event.target.value);
                updateParam('config', event.target.value);
              }}
            />
          </label>
          <label>
            Trace status
            <select
              value={traceStatusFilter}
              onChange={(event) => {
                const next = parseTraceStatusFilter(event.target.value);
                setTraceStatusFilter(next);
                updateParam('traceStatus', next, 'all');
              }}
            >
              <option value="all">All</option>
              <option value="complete">Complete</option>
              <option value="incomplete">Incomplete</option>
            </select>
          </label>
          <label>
            Signature
            <select
              value={signatureStatusFilter}
              onChange={(event) => {
                const next = parseSignatureStatusFilter(event.target.value);
                setSignatureStatusFilter(next);
                updateParam('signatureStatus', next, 'all');
              }}
            >
              <option value="all">All</option>
              <option value="verified">Verified</option>
              <option value="failed">Failed</option>
              <option value="not_verified">Not verified</option>
            </select>
          </label>
          <label>
            Reason code
            <input
              className="table-search-input"
              value={reasonCodeFilter}
              onChange={(event) => {
                setReasonCodeFilter(event.target.value);
                updateParam('reason', event.target.value);
              }}
            />
          </label>
          <label>
            Correlation ID
            <input
              className="table-search-input"
              value={correlationFilter}
              onChange={(event) => {
                setCorrelationFilter(event.target.value);
                updateParam('correlation', event.target.value);
              }}
            />
          </label>
          <label>
            Trace ID
            <input
              className="table-search-input"
              value={traceFocus}
              onChange={(event) => {
                setTraceFocus(event.target.value);
                updateParam('trace', event.target.value);
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={onlyWithReplayEvidence}
              onChange={(event) => {
                setOnlyWithReplayEvidence(event.target.checked);
                updateParam('replayOnly', event.target.checked ? '1' : '', '');
              }}
            />
            Only decisions with replay evidence
          </label>
          <button type="button" onClick={clearFilters}>Clear filters</button>
          <button type="button" onClick={switchTo24h}>Switch to last 24h</button>
          <button type="button" onClick={enableRealtime}>Enable realtime</button>
          <button type="button" onClick={() => void exportRows('csv', filtered)}>Export CSV</button>
          <button type="button" onClick={() => void exportRows('json', filtered)}>Export JSON</button>
          <button type="button" onClick={exportTracePack} disabled={selectedRows.length === 0}>
            Export Trace Pack
          </button>
        </div>

        {actionMessage ? <p className="muted-line">{actionMessage}</p> : null}

        <div className="policy-summary-strip">
          <p>
            Results: {filtered.length}
            {' | '}
            Sample size: {decisionBaseSampleSize}
            {' | '}
            Freshness: {formatRelativeFromNow(lastDecisionTs)}
            {' | '}
            Coverage: {coveragePct === null ? 'unknown' : `${coveragePct.toFixed(1)}%`}
            {' | '}
            Telemetry: {telemetryStatus === 'OFF' ? 'Off' : 'On'}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="focus-banner">
            <p>0 traces in selected time window.</p>
            <p>Realtime channel: {wsStatus.statusLabel === 'Connected' ? 'connected' : 'disabled'}.</p>
            <p>Last indexed trace: {formatUtc(lastDecisionTs)}</p>
            <p>Most common reasons: {emptyReasons.join(', ')}.</p>
          </div>
        ) : null}

        <table className="simple-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((row) => selectedTraceIds.includes(row.trace_id))}
                  onChange={toggleSelectAllFiltered}
                />
              </th>
              <th>Trace ID</th>
              <th>Correlation ID</th>
              <th>Timestamp</th>
              <th>Machine ID</th>
              <th>Cohort</th>
              <th>Policy ID</th>
              <th>Decision</th>
              <th>Escalation</th>
              <th>Confidence</th>
              <th>Triggered by</th>
              <th>Config trust</th>
              <th>Trace status</th>
              <th>Signature</th>
              <th>Replay</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => {
              const raw = asRecord(row.raw_trace);
              const confidenceReported = hasOwn(raw, 'confidence_score') && typeof raw.confidence_score === 'number'
                ? Number(raw.confidence_score)
                : null;
              const cohort = row.cohort_id ?? agentCohortMap[row.agent_id] ?? null;
              const machine = row.machine_id ?? row.agent_id;
              const traceStatus = normalizeTraceStatus(row);
              const signatureVerification = row.signature_verification_status ?? 'not_verified';
              const trust = toTrustLabel(row);
              const isNew = (() => {
                const ts = toMs(row.timestamp);
                return ts !== null && Date.now() - ts <= 15_000;
              })();
              return (
                <tr
                  key={`${row.trace_id || row.correlation_id || index}`}
                  className={!row.signature_valid ? 'row-alert click-row' : 'click-row'}
                  onClick={() => setSelectedTraceId(row.trace_id)}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedTraceIds.includes(row.trace_id)}
                      onChange={(event) => {
                        event.stopPropagation();
                        toggleSelected(row.trace_id);
                      }}
                    />
                  </td>
                  <td>{row.trace_id || <span title="trace_id not reported">n/a</span>}</td>
                  <td>{row.correlation_id || <span title="correlation_id not reported">n/a</span>}</td>
                  <td>{formatUtc(row.timestamp)} {isNew ? <span className="delta-chip ok">NEW</span> : null}</td>
                  <td>{machine || <span title="machine id not reported">n/a</span>}</td>
                  <td>{cohort ?? <span title="cohort not reported">n/a</span>}</td>
                  <td>{row.policy_id || <span title="policy id not reported">n/a</span>}</td>
                  <td>{toDecisionLabel(row.action_decision)}</td>
                  <td>{row.escalation_level ?? <span title="escalation level not reported">n/a</span>}</td>
                  <td>{confidenceReported === null ? <span title="confidence not reported">n/a</span> : confidenceReported.toFixed(2)}</td>
                  <td title={row.reason_code ?? row.triggered_by ?? 'trigger reason not reported'}>
                    {summarizeTriggeredBy(row)}
                  </td>
                  <td>{trust}</td>
                  <td>{traceStatus}</td>
                  <td>{signatureVerification}</td>
                  <td>
                    <button
                      type="button"
                      disabled={!row.trace_id}
                      title={!row.trace_id ? 'No trace generated' : 'Replay trace'}
                      onClick={(event) => {
                        event.stopPropagation();
                        void replaySelected(row);
                      }}
                    >
                      Replay
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={15} className="muted-line">No traces match current filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <section className="policy-replay-panel">
          <h4>Replay</h4>
          {selectedTrace ? (
            <div className="ops-grid">
              <div className="timeline-side">
                <h4>Replay summary</h4>
                <ul className="kv-list">
                  <li><span>Decision</span><strong>{toDecisionLabel(selectedTrace.action_decision)}</strong></li>
                  <li><span>Confidence</span><strong>{selectedTrace.confidence_score.toFixed(2)}</strong></li>
                  <li><span>Reason</span><strong>{summarizeTriggeredBy(selectedTrace)}</strong></li>
                  <li><span>Policy version</span><strong>{selectedTrace.policy_version ?? 'n/a'}</strong></li>
                  <li><span>Machine / cohort</span><strong>{selectedTrace.machine_id ?? selectedTrace.agent_id} / {selectedTrace.cohort_id ?? agentCohortMap[selectedTrace.agent_id] ?? 'n/a'}</strong></li>
                  <li><span>Time</span><strong>{formatUtc(selectedTrace.timestamp)}</strong></li>
                  <li><span>Replay verification</span><strong>{replayLoading ? 'Running...' : replayResult ? `${replayResult.result} (${replayResult.details})` : replayError ?? 'n/a'}</strong></li>
                </ul>

                {missingSegments.length === 0 ? (
                  <p className="focus-banner">Complete trace.</p>
                ) : (
                  <div className="focus-banner">
                    <p>Incomplete trace - missing segments: {missingSegments.join(', ')}.</p>
                    <p>Likely reasons: {likelyMissingReasons.join(', ')}.</p>
                  </div>
                )}

                <h4>Signature verification</h4>
                <ul className="kv-list">
                  <li><span>Result</span><strong>{selectedTrace.signature_verification_status ?? 'not_verified'}</strong></li>
                  <li><span>Signer / key id</span><strong>{String(asRecord(selectedTrace.raw_trace).signer ?? asRecord(selectedTrace.raw_trace).key_id ?? 'n/a')}</strong></li>
                  <li><span>Verified at</span><strong>{formatUtc(String(asRecord(selectedTrace.raw_trace).signature_verified_at ?? ''))}</strong></li>
                  <li><span>Failure reason</span><strong>{String(asRecord(selectedTrace.raw_trace).signature_failure_reason ?? 'n/a')}</strong></li>
                </ul>
              </div>

              <div className="timeline-side">
                <h4>Decision chain</h4>
                <div className="trace-segment-list">
                  {traceSegments.map((segment) => (
                    <div key={segment.key} className="trace-segment-card">
                      <p className="trace-segment-head">
                        <strong>{segment.title}</strong> <span>{formatUtc(segment.timestamp ?? selectedTrace.timestamp)}</span>
                      </p>
                      <p className="muted-line">Signature: {segment.signatureStatus ?? 'n/a'}</p>
                      {segment.confidence !== null ? <p className="muted-line">Confidence: {segment.confidence.toFixed(2)}</p> : null}
                      {segment.contributors.length > 0 ? <p className="muted-line">Contributors: {segment.contributors.join(', ')}</p> : null}
                      <pre>{segment.payload == null ? 'n/a' : JSON.stringify(segment.payload, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="muted-line">Select a trace row to inspect the full chain and replay evidence.</p>
          )}
        </section>
      </Panel>

      <Panel title="Immutable Audit Ledger">
        {ledger.loading ? <p className="muted-line">Loading audit ledger...</p> : null}
        {ledger.error ? <p className="error-line">{ledger.error.code}: {ledger.error.message}</p> : null}
        <table className="simple-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Cohort</th>
              <th>State transition</th>
              <th>Correlation ID</th>
            </tr>
          </thead>
          <tbody>
            {ledger.rows.slice(0, 40).map((row, index) => (
              <tr key={`${row.timestamp}-${row.correlation_id}-${index}`}>
                <td>{formatUtc(row.timestamp)}</td>
                <td>{row.actor || 'n/a'}</td>
                <td>{row.action || 'n/a'}</td>
                <td>{row.cohort || 'n/a'}</td>
                <td>{row.previous_state} {'->'} {row.resulting_state}</td>
                <td>{row.correlation_id || 'n/a'}</td>
              </tr>
            ))}
            {ledger.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted-line">No immutable ledger rows available.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
