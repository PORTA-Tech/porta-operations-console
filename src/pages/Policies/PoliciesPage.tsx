import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { useConsoleOperations } from '../../hooks/useConsoleOperations';
import { useOperatorAuth } from '../../hooks/useOperatorAuth';
import { getNodeSnapshot, type NodeSnapshotRow } from '../../api/nodes';
import { toApiError, type ApiError } from '../../api/client';
import type { AuditDecisionRecord, PolicyRecord } from '../../types/consoleOperations';
import { formatUtc } from '../../utils/date';

type PoliciesTab = 'library' | 'decisions';
type DecisionOutcome = 'allow' | 'block' | 'no_op' | 'unknown';
type DecisionOutcomeFilter = 'all' | DecisionOutcome;
type TimeRange = '15m' | '1h' | '6h' | '24h';
type DecisionTelemetryStatus = 'OFF' | 'ON_EMPTY' | 'ON_WITH_DATA';
type PolicySignatureStatus = 'VALID' | 'INVALID' | 'UNKNOWN';
type DataQualityVerdict = 'OK' | 'INCONCLUSIVE';
type CompareType = 'version' | 'cohort';

interface PolicyTelemetry {
  policyId: string;
  signatureStatus: PolicySignatureStatus;
  deployedCohorts: string[] | null;
  decisionRatePerMin: number | null;
  lastDecisionTs: string | null;
  eligibleMachinesCount: number | null;
  reportingMachinesCount: number | null;
  coveragePct: number | null;
  freshnessSeconds: number | null;
  dataQualityVerdict: DataQualityVerdict;
  dataQualityReasons: string[];
  avgConfidence: number | null;
  decisionCounts: {
    allow: number;
    block: number;
    no_op: number;
    unknown: number;
  };
  topCohorts: Array<{ cohort: string; count: number }>;
}

interface DecisionTelemetryRow {
  row: AuditDecisionRecord;
  outcome: DecisionOutcome;
  cohort: string | null;
  machine: string;
  reasonCode: string;
}

const TIME_RANGE_MS: Record<TimeRange, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000
};

const POLICY_ACTIVITY_WINDOW_MINUTES = 10;
const POLICY_MIN_SAMPLE_MACHINES = 20;
const POLICY_MIN_COVERAGE_PCT = 70;
const DECISION_FILTERS: DecisionOutcomeFilter[] = ['all', 'allow', 'block', 'no_op', 'unknown'];
const TIME_RANGES: TimeRange[] = ['15m', '1h', '6h', '24h'];

function parseIsoMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function parseDecisionFilter(raw: string | null): DecisionOutcomeFilter {
  return DECISION_FILTERS.includes((raw ?? '') as DecisionOutcomeFilter) ? (raw as DecisionOutcomeFilter) : 'all';
}

function parseTimeRange(raw: string | null): TimeRange {
  return TIME_RANGES.includes((raw ?? '') as TimeRange) ? (raw as TimeRange) : '1h';
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function signatureStatusFromRows(rows: AuditDecisionRecord[]): PolicySignatureStatus {
  if (rows.length === 0) return 'UNKNOWN';
  if (rows.some((row) => row.signature_status === 'INVALID' || row.signature_valid === false)) return 'INVALID';
  if (rows.some((row) => row.signature_status === 'UNKNOWN')) return 'UNKNOWN';
  return 'VALID';
}

function outcomeFromAction(action: AuditDecisionRecord['action_decision']): DecisionOutcome {
  if (action === 'intervene') return 'allow';
  if (action === 'blocked') return 'block';
  if (action === 'cooldown' || action === 'skip') return 'no_op';
  return 'unknown';
}

function outcomeLabel(outcome: DecisionOutcome): 'Allow' | 'Block' | 'No-op' | 'Unknown' {
  if (outcome === 'allow') return 'Allow';
  if (outcome === 'block') return 'Block';
  if (outcome === 'no_op') return 'No-op';
  return 'Unknown';
}

function policyStatusTone(policy: PolicyRecord): string {
  if (!policy.active_flag) return 'status-badge warn';
  if (policy.status === 'error') return 'status-badge critical';
  return 'status-badge ok';
}

function signatureTone(status: PolicySignatureStatus): string {
  if (status === 'VALID') return 'status-badge ok';
  if (status === 'INVALID') return 'status-badge critical';
  return 'status-badge warn';
}

function reasonLabel(code: string): string {
  if (code === 'NO_TELEMETRY') return 'No telemetry';
  if (code === 'INSUFFICIENT_SAMPLE') return 'Insufficient sample';
  if (code === 'INSUFFICIENT_COVERAGE') return 'Coverage too low';
  if (code === 'STALE_DATA') return 'Stale data';
  if (code === 'SIGNATURE_UNKNOWN') return 'Signature unknown';
  if (code === 'SIGNATURE_INVALID') return 'Signature invalid';
  if (code === 'NOT_DEPLOYED') return 'Not deployed';
  if (code === 'NO_DEPLOYMENT_INFO') return 'No deployment info';
  if (code === 'FILTER_CONFLICT') return 'Filter conflict';
  return code;
}

function primaryReason(reasons: string[]): string {
  if (reasons.length === 0) return '';
  return reasonLabel(reasons[0] ?? 'n/a');
}

function summarizeReasons(reasons: string[]): string {
  if (reasons.includes('NO_TELEMETRY')) return 'Telemetry is off.';
  if (reasons.includes('INSUFFICIENT_SAMPLE')) return 'Not enough reporting machines.';
  if (reasons.includes('INSUFFICIENT_COVERAGE')) return 'Coverage is below minimum.';
  if (reasons.includes('STALE_DATA')) return 'Data is stale.';
  if (reasons.includes('SIGNATURE_INVALID')) return 'Policy signature is invalid.';
  if (reasons.includes('SIGNATURE_UNKNOWN')) return 'Policy signature is unknown.';
  return 'Metrics are unavailable.';
}

function formatRate(rate: number | null): string {
  if (rate === null) return 'n/a';
  return `${rate.toFixed(2)}/min`;
}

function formatCoverage(coverage: number | null): string {
  if (coverage === null) return 'n/a';
  return `${coverage.toFixed(1)}%`;
}

function formatNumber(value: number | null): string {
  if (value === null) return 'n/a';
  return value.toFixed(2);
}

function toDecisionReason(row: AuditDecisionRecord): string {
  const reason = row.reason_code ?? row.triggered_by ?? '';
  return reason.trim() || 'UNKNOWN';
}

function rawTraceSummary(row: AuditDecisionRecord): string {
  const primitives = row.contributing_primitives.length > 0 ? row.contributing_primitives.join(', ') : 'n/a';
  return `Primitives: ${primitives}`;
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

function resolveCohort(row: AuditDecisionRecord, agentToCohort: Map<string, string>): string | null {
  return row.cohort_id ?? agentToCohort.get(row.agent_id) ?? null;
}

function hasCoverageBelowMin(telemetry: PolicyTelemetry): boolean {
  return telemetry.coveragePct !== null && telemetry.coveragePct < POLICY_MIN_COVERAGE_PCT;
}

function computeTelemetry(
  policies: PolicyRecord[],
  audits: AuditDecisionRecord[],
  nodes: NodeSnapshotRow[],
  agentToCohort: Map<string, string>
): Map<string, PolicyTelemetry> {
  const now = Date.now();
  const windowMs = POLICY_ACTIVITY_WINDOW_MINUTES * 60 * 1000;
  const map = new Map<string, PolicyTelemetry>();
  const rowsByPolicy = new Map<string, AuditDecisionRecord[]>();

  for (const row of audits) {
    const bucket = rowsByPolicy.get(row.policy_id) ?? [];
    bucket.push(row);
    rowsByPolicy.set(row.policy_id, bucket);
  }

  for (const policy of policies) {
    const rows = rowsByPolicy.get(policy.policy_id) ?? [];
    const recentRows = rows.filter((row) => {
      const ms = parseIsoMs(row.timestamp);
      return ms !== null && now - ms <= windowMs;
    });
    const latestTs = rows
      .map((row) => row.timestamp)
      .sort((left, right) => {
        const leftMs = parseIsoMs(left) ?? 0;
        const rightMs = parseIsoMs(right) ?? 0;
        return rightMs - leftMs;
      })[0] ?? null;
    const freshnessSeconds = latestTs
      ? Math.max(0, Math.floor((Date.now() - (parseIsoMs(latestTs) ?? Date.now())) / 1000))
      : null;

    const eligibleMachinesCount = nodes.length > 0 ? nodes.length : null;
    const reportingAgentSet = new Set<string>(recentRows.map((row) => row.agent_id));
    const reportingMachinesCount = eligibleMachinesCount === null
      ? null
      : reportingAgentSet.size;
    const coveragePct = eligibleMachinesCount !== null && eligibleMachinesCount > 0 && reportingMachinesCount !== null
      ? round((reportingMachinesCount / eligibleMachinesCount) * 100, 2)
      : null;

    const cohorts = new Set<string>();
    for (const row of rows) {
      const cohort = resolveCohort(row, agentToCohort);
      if (cohort) cohorts.add(cohort);
    }
    const deployedCohorts = cohorts.size > 0 ? [...cohorts].sort() : null;

    const counts = {
      allow: 0,
      block: 0,
      no_op: 0,
      unknown: 0
    } as PolicyTelemetry['decisionCounts'];
    for (const row of recentRows) {
      const outcome = outcomeFromAction(row.action_decision);
      counts[outcome] += 1;
    }
    const sampleValid = reportingMachinesCount !== null && reportingMachinesCount >= POLICY_MIN_SAMPLE_MACHINES;
    const decisionRatePerMin = sampleValid && recentRows.length > 0
      ? round(recentRows.length / POLICY_ACTIVITY_WINDOW_MINUTES, 2)
      : null;
    const avgConfidence = sampleValid && recentRows.length > 0
      ? round(recentRows.reduce((sum, row) => sum + row.confidence_score, 0) / recentRows.length, 3)
      : null;

    const cohortCountMap = new Map<string, number>();
    for (const row of recentRows) {
      const cohort = resolveCohort(row, agentToCohort);
      if (!cohort) continue;
      cohortCountMap.set(cohort, (cohortCountMap.get(cohort) ?? 0) + 1);
    }
    const topCohorts = [...cohortCountMap.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([cohort, count]) => ({ cohort, count }));

    const dataQualityReasons: string[] = [];
    if (eligibleMachinesCount === null) {
      dataQualityReasons.push('NO_TELEMETRY');
    } else {
      if (reportingMachinesCount !== null && reportingMachinesCount < POLICY_MIN_SAMPLE_MACHINES) {
        dataQualityReasons.push('INSUFFICIENT_SAMPLE');
      }
      if (recentRows.length === 0) {
        dataQualityReasons.push('NO_TELEMETRY');
      }
      if (coveragePct !== null && coveragePct < POLICY_MIN_COVERAGE_PCT) {
        dataQualityReasons.push('INSUFFICIENT_COVERAGE');
      }
    }
    if (freshnessSeconds !== null && freshnessSeconds > 120) {
      dataQualityReasons.push('STALE_DATA');
    }
    const signatureStatus = signatureStatusFromRows(rows);
    if (signatureStatus === 'UNKNOWN') {
      dataQualityReasons.push('SIGNATURE_UNKNOWN');
    }
    if (signatureStatus === 'INVALID') {
      dataQualityReasons.push('SIGNATURE_INVALID');
    }
    if (!policy.active_flag) {
      dataQualityReasons.push('NOT_DEPLOYED');
    }
    if (deployedCohorts === null) {
      dataQualityReasons.push('NO_DEPLOYMENT_INFO');
    }

    map.set(policy.policy_id, {
      policyId: policy.policy_id,
      signatureStatus,
      deployedCohorts,
      decisionRatePerMin,
      lastDecisionTs: latestTs,
      eligibleMachinesCount,
      reportingMachinesCount,
      coveragePct,
      freshnessSeconds,
      dataQualityVerdict: dataQualityReasons.length === 0 ? 'OK' : 'INCONCLUSIVE',
      dataQualityReasons,
      avgConfidence,
      decisionCounts: counts,
      topCohorts
    });
  }

  return map;
}

function compareOutcomeDistribution(left: PolicyTelemetry['decisionCounts'], right: PolicyTelemetry['decisionCounts']) {
  const leftTotal = left.allow + left.block + left.no_op + left.unknown;
  const rightTotal = right.allow + right.block + right.no_op + right.unknown;
  const pct = (count: number, total: number): number | null => (total > 0 ? round((count / total) * 100, 1) : null);
  return {
    left: {
      allow: pct(left.allow, leftTotal),
      block: pct(left.block, leftTotal),
      no_op: pct(left.no_op, leftTotal),
      unknown: pct(left.unknown, leftTotal)
    },
    right: {
      allow: pct(right.allow, rightTotal),
      block: pct(right.block, rightTotal),
      no_op: pct(right.no_op, rightTotal),
      unknown: pct(right.unknown, rightTotal)
    }
  };
}

function cohortCompareTelemetry(
  cohort: string,
  audits: AuditDecisionRecord[],
  nodes: NodeSnapshotRow[],
  agentToCohort: Map<string, string>
): PolicyTelemetry {
  const now = Date.now();
  const windowMs = POLICY_ACTIVITY_WINDOW_MINUTES * 60 * 1000;
  const rows = audits.filter((row) => resolveCohort(row, agentToCohort) === cohort);
  const recentRows = rows.filter((row) => {
    const ms = parseIsoMs(row.timestamp);
    return ms !== null && now - ms <= windowMs;
  });

  const eligibleMachinesCount = nodes.filter((node) => node.cohort === cohort).length;
  const reportingSet = new Set<string>(recentRows.map((row) => row.agent_id));
  const reportingMachinesCount = reportingSet.size;
  const coveragePct = eligibleMachinesCount > 0
    ? round((reportingMachinesCount / eligibleMachinesCount) * 100, 2)
    : null;
  const latestTs = rows
    .map((row) => row.timestamp)
    .sort((left, right) => (parseIsoMs(right) ?? 0) - (parseIsoMs(left) ?? 0))[0] ?? null;
  const freshnessSeconds = latestTs
    ? Math.max(0, Math.floor((Date.now() - (parseIsoMs(latestTs) ?? Date.now())) / 1000))
    : null;

  const counts = {
    allow: 0,
    block: 0,
    no_op: 0,
    unknown: 0
  } as PolicyTelemetry['decisionCounts'];
  for (const row of recentRows) {
    counts[outcomeFromAction(row.action_decision)] += 1;
  }

  const reasons: string[] = [];
  if (reportingMachinesCount < POLICY_MIN_SAMPLE_MACHINES) reasons.push('INSUFFICIENT_SAMPLE');
  if (recentRows.length === 0) reasons.push('NO_TELEMETRY');
  if (coveragePct !== null && coveragePct < POLICY_MIN_COVERAGE_PCT) reasons.push('INSUFFICIENT_COVERAGE');
  if (freshnessSeconds !== null && freshnessSeconds > 120) reasons.push('STALE_DATA');
  if (signatureStatusFromRows(rows) === 'INVALID') reasons.push('SIGNATURE_INVALID');
  if (signatureStatusFromRows(rows) === 'UNKNOWN') reasons.push('SIGNATURE_UNKNOWN');

  const sampleValid = reportingMachinesCount >= POLICY_MIN_SAMPLE_MACHINES;
  return {
    policyId: cohort,
    signatureStatus: signatureStatusFromRows(rows),
    deployedCohorts: [cohort],
    decisionRatePerMin: sampleValid && recentRows.length > 0 ? round(recentRows.length / POLICY_ACTIVITY_WINDOW_MINUTES, 2) : null,
    lastDecisionTs: latestTs,
    eligibleMachinesCount,
    reportingMachinesCount,
    coveragePct,
    freshnessSeconds,
    dataQualityVerdict: reasons.length === 0 ? 'OK' : 'INCONCLUSIVE',
    dataQualityReasons: reasons,
    avgConfidence: sampleValid && recentRows.length > 0 ? round(recentRows.reduce((sum, row) => sum + row.confidence_score, 0) / recentRows.length, 3) : null,
    decisionCounts: counts,
    topCohorts: [{ cohort, count: recentRows.length }]
  };
}

export function PoliciesPage() {
  const [params, setParams] = useSearchParams();
  const { policies, audits, loading, error, savePolicy, deployPolicyById, replay } = useConsoleOperations();
  const { operatorRole } = useOperatorAuth();

  const [nodes, setNodes] = useState<NodeSnapshotRow[]>([]);
  const [nodeLoading, setNodeLoading] = useState(true);
  const [nodeError, setNodeError] = useState<ApiError | undefined>();

  const [selectedPolicyId, setSelectedPolicyId] = useState<string | undefined>();
  const [pageMessage, setPageMessage] = useState<string>('');
  const [diffNotice, setDiffNotice] = useState<{ policyId: string; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [policyFilter, setPolicyFilter] = useState(params.get('policy') ?? 'all');
  const [decisionFilter, setDecisionFilter] = useState<DecisionOutcomeFilter>(parseDecisionFilter(params.get('outcome')));
  const [confidenceMin, setConfidenceMin] = useState(0);
  const [timeRange, setTimeRange] = useState<TimeRange>(parseTimeRange(params.get('window')));
  const [cohortFilter, setCohortFilter] = useState('all');
  const [machineFilter, setMachineFilter] = useState(params.get('agent') ?? '');
  const [reasonCodeFilter, setReasonCodeFilter] = useState('');
  const [onlyWithReplayEvidence, setOnlyWithReplayEvidence] = useState(false);

  const [selectedDecision, setSelectedDecision] = useState<DecisionTelemetryRow | undefined>();
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayResult, setReplayResult] = useState<{ result: 'match' | 'mismatch'; details: string } | undefined>();
  const [replayError, setReplayError] = useState<string | undefined>();

  const [compareType, setCompareType] = useState<CompareType>('version');
  const [compareLeft, setCompareLeft] = useState('');
  const [compareRight, setCompareRight] = useState('');

  const tab = (params.get('tab') as PoliciesTab | null) ?? 'library';
  const compareMode = params.get('compare') ?? 'none';
  const compareEnabled = compareMode !== 'none';

  useEffect(() => {
    let mounted = true;
    const refreshNodes = async () => {
      try {
        const response = await getNodeSnapshot();
        if (!mounted) return;
        setNodes(response);
        setNodeError(undefined);
      } catch (err) {
        if (!mounted) return;
        setNodeError(toApiError(err));
      } finally {
        if (mounted) setNodeLoading(false);
      }
    };
    void refreshNodes();
    const timer = window.setInterval(() => {
      void refreshNodes();
    }, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (policies.length === 0) return;
    if (!selectedPolicyId) {
      setSelectedPolicyId(policies[0]?.policy_id);
      return;
    }
    if (!policies.some((policy) => policy.policy_id === selectedPolicyId)) {
      setSelectedPolicyId(policies[0]?.policy_id);
    }
  }, [policies, selectedPolicyId]);

  useEffect(() => {
    setMachineFilter(params.get('agent') ?? '');
    setPolicyFilter(params.get('policy') ?? 'all');
    setDecisionFilter(parseDecisionFilter(params.get('outcome')));
    setTimeRange(parseTimeRange(params.get('window')));
  }, [params]);

  const updateParam = (key: string, value: string, clearValue?: string) => {
    const next = new URLSearchParams(params);
    if (value === '' || (clearValue && value === clearValue)) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const setTab = (nextTab: PoliciesTab) => {
    updateParam('tab', nextTab, 'library');
  };

  const agentToCohort = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      map.set(node.node_id, node.cohort);
    }
    return map;
  }, [nodes]);

  const cohortOptions = useMemo(() => {
    const values = new Set<string>();
    for (const node of nodes) values.add(node.cohort);
    for (const row of audits) {
      const cohort = resolveCohort(row, agentToCohort);
      if (cohort) values.add(cohort);
    }
    return [...values].sort();
  }, [nodes, audits, agentToCohort]);

  const telemetryByPolicy = useMemo(
    () => computeTelemetry(policies, audits, nodes, agentToCohort),
    [policies, audits, nodes, agentToCohort]
  );

  const activePolicies = policies.filter((policy) => policy.active_flag);
  const lowCoverageActivePolicies = activePolicies.filter((policy) => {
    const telemetry = telemetryByPolicy.get(policy.policy_id);
    return telemetry ? hasCoverageBelowMin(telemetry) : false;
  }).length;
  const signatureFailures = activePolicies.filter((policy) => telemetryByPolicy.get(policy.policy_id)?.signatureStatus === 'INVALID').length;

  const selectedPolicy = policies.find((policy) => policy.policy_id === selectedPolicyId) ?? null;

  const mappedDecisionRows = useMemo(
    (): DecisionTelemetryRow[] =>
      audits.map((row) => ({
        row,
        outcome: outcomeFromAction(row.action_decision),
        cohort: resolveCohort(row, agentToCohort),
        machine: row.machine_id ?? row.agent_id,
        reasonCode: toDecisionReason(row)
      })),
    [audits, agentToCohort]
  );

  const decisionRowsInWindow = useMemo(
    () =>
      mappedDecisionRows.filter((entry) => {
        const decisionMs = parseIsoMs(entry.row.timestamp);
        return decisionMs !== null && Date.now() - decisionMs <= TIME_RANGE_MS[timeRange];
      }),
    [mappedDecisionRows, timeRange]
  );

  const decisionRowsBase = useMemo(
    () =>
      decisionRowsInWindow.filter((entry) => {
        if (policyFilter !== 'all' && entry.row.policy_id !== policyFilter) return false;
        if (decisionFilter !== 'all' && entry.outcome !== decisionFilter) return false;
        if (cohortFilter !== 'all' && entry.cohort !== cohortFilter) return false;
        if (machineFilter.trim() && !entry.machine.toLowerCase().includes(machineFilter.trim().toLowerCase())) return false;
        if (reasonCodeFilter.trim() && !entry.reasonCode.toLowerCase().includes(reasonCodeFilter.trim().toLowerCase())) return false;
        return true;
      }),
    [decisionRowsInWindow, policyFilter, decisionFilter, cohortFilter, machineFilter, reasonCodeFilter]
  );

  const policyDecisionRows = useMemo(
    () =>
      decisionRowsBase.filter((entry) => {
        if (entry.row.confidence_score < confidenceMin) return false;
        if (onlyWithReplayEvidence && !(entry.row.trace_id && entry.row.trace_id.length > 0)) return false;
        return true;
      }),
    [decisionRowsBase, confidenceMin, onlyWithReplayEvidence]
  );

  const telemetryStatus: DecisionTelemetryStatus = audits.length === 0
    ? 'OFF'
    : decisionRowsInWindow.length === 0
      ? 'ON_EMPTY'
      : 'ON_WITH_DATA';
  const decisionBaseSampleSize = useMemo(
    () => new Set(decisionRowsBase.map((entry) => entry.machine)).size,
    [decisionRowsBase]
  );
  const disableConfidence = telemetryStatus !== 'ON_WITH_DATA' || decisionBaseSampleSize === 0;
  const disableReplayOnly = telemetryStatus !== 'ON_WITH_DATA' || decisionBaseSampleSize === 0;

  useEffect(() => {
    if (disableReplayOnly && onlyWithReplayEvidence) {
      setOnlyWithReplayEvidence(false);
    }
  }, [disableReplayOnly, onlyWithReplayEvidence]);

  const decisionLatestTimestamp = decisionRowsInWindow
    .map((entry) => entry.row.timestamp)
    .sort((left, right) => (parseIsoMs(right) ?? 0) - (parseIsoMs(left) ?? 0))[0];
  const decisionFreshnessSeconds = decisionLatestTimestamp
    ? Math.max(0, Math.floor((Date.now() - (parseIsoMs(decisionLatestTimestamp) ?? Date.now())) / 1000))
    : null;
  const decisionCoveragePct = (() => {
    if (nodes.length === 0) return null;
    const eligible = policyFilter === 'all'
      ? nodes.length
      : (telemetryByPolicy.get(policyFilter)?.eligibleMachinesCount ?? nodes.length);
    if (!eligible || eligible <= 0) return null;
    return round((decisionBaseSampleSize / eligible) * 100, 2);
  })();
  const telemetryLabel = telemetryStatus === 'OFF' ? 'Off' : 'On';

  const policyOptions = policies.map((policy) => ({ id: policy.policy_id, label: `${policy.name} (${policy.version})` }));

  useEffect(() => {
    if (compareLeft || compareRight) return;
    if (policyOptions.length >= 2) {
      setCompareLeft(policyOptions[0]?.id ?? '');
      setCompareRight(policyOptions[1]?.id ?? '');
    }
  }, [policyOptions, compareLeft, compareRight]);

  const canDeploy = operatorRole === 'operator' || operatorRole === 'admin';
  const canDisable = operatorRole === 'admin';

  const handleDeploy = async (policy: PolicyRecord) => {
    if (!canDeploy) return;
    setActionLoading(true);
    try {
      await deployPolicyById(policy.policy_id);
      setPageMessage(`Deployed ${policy.policy_id}.`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisable = async (policy: PolicyRecord) => {
    if (!canDisable) return;
    setActionLoading(true);
    try {
      await savePolicy({ ...policy, active_flag: false, status: 'inactive' });
      setPageMessage(`Disabled ${policy.policy_id}.`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDiffVersions = (policy: PolicyRecord) => {
    const candidates = policies
      .filter((row) => row.name === policy.name && row.policy_id !== policy.policy_id)
      .sort((left, right) => (parseIsoMs(right.last_modified) ?? 0) - (parseIsoMs(left.last_modified) ?? 0));
    if (candidates.length === 0) {
      setDiffNotice({ policyId: policy.policy_id, text: `No alternate version found for ${policy.name}.` });
      return;
    }
    if (compareMode === 'none') {
      updateParam('compare', 'policy');
    }
    setCompareType('version');
    setCompareLeft(policy.policy_id);
    setCompareRight(candidates[0]?.policy_id ?? '');
    setDiffNotice({ policyId: policy.policy_id, text: `Diff ready for ${policy.name}.` });
  };

  useEffect(() => {
    if (!diffNotice) return;
    const timer = window.setTimeout(() => setDiffNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [diffNotice]);

  const runReplay = async (entry: DecisionTelemetryRow) => {
    setSelectedDecision(entry);
    setReplayResult(undefined);
    setReplayError(undefined);
    if (!entry.row.trace_id) return;
    setReplayLoading(true);
    try {
      const result = await replay(entry.row.trace_id);
      setReplayResult(result);
    } catch (err) {
      const apiError = toApiError(err);
      setReplayError(`${apiError.code}: ${apiError.message}`);
    } finally {
      setReplayLoading(false);
    }
  };

  const exportTracePack = () => {
    if (!selectedDecision) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadJson(`policy-trace-pack-${stamp}.json`, {
      generated_at_utc: new Date().toISOString(),
      decision: selectedDecision.row,
      derived: {
        outcome: selectedDecision.outcome,
        cohort: selectedDecision.cohort,
        machine: selectedDecision.machine,
        reason_code: selectedDecision.reasonCode
      },
      replay_result: replayResult ?? null
    });
  };

  const comparePayload = useMemo(() => {
    if (!compareEnabled) return null;
    if (compareType === 'version') {
      const left = telemetryByPolicy.get(compareLeft);
      const right = telemetryByPolicy.get(compareRight);
      if (!left || !right) return null;
      const inconclusive = left.dataQualityVerdict !== 'OK' || right.dataQualityVerdict !== 'OK';
      return {
        type: 'version' as const,
        leftLabel: compareLeft,
        rightLabel: compareRight,
        left,
        right,
        inconclusive,
        distribution: compareOutcomeDistribution(left.decisionCounts, right.decisionCounts)
      };
    }

    const left = cohortCompareTelemetry(compareLeft, audits, nodes, agentToCohort);
    const right = cohortCompareTelemetry(compareRight, audits, nodes, agentToCohort);
    const inconclusive = left.dataQualityVerdict !== 'OK' || right.dataQualityVerdict !== 'OK';
    return {
      type: 'cohort' as const,
      leftLabel: compareLeft,
      rightLabel: compareRight,
      left,
      right,
      inconclusive,
      distribution: compareOutcomeDistribution(left.decisionCounts, right.decisionCounts)
    };
  }, [compareEnabled, compareType, telemetryByPolicy, compareLeft, compareRight, audits, nodes, agentToCohort]);

  return (
    <div className="stack">
      <div className="machine-drilldown-tabs">
        <button type="button" className={tab === 'library' ? 'active' : undefined} onClick={() => setTab('library')}>
          Policy Library
        </button>
        <button type="button" className={tab === 'decisions' ? 'active' : undefined} onClick={() => setTab('decisions')}>
          Decisions and Replay
        </button>
      </div>

      {tab === 'library' ? (
        <Panel title="Policy Library">
          {loading ? <p className="muted-line">Loading policies...</p> : null}
          {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
          {nodeLoading ? <p className="muted-line">Loading machine coverage...</p> : null}
          {nodeError ? <p className="error-line">{nodeError.code}: {nodeError.message}</p> : null}
          {pageMessage ? <p className="muted-line">{pageMessage}</p> : null}

          <div className="policy-summary-strip">
            <p>
              {activePolicies.length} active policies. {lowCoverageActivePolicies} with coverage below minimum. {signatureFailures} signature failures.
            </p>
          </div>

          <table className="simple-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Version</th>
                <th>Status</th>
                <th>Signature</th>
                <th>Deployments</th>
                <th>Decision activity</th>
                <th>Coverage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => {
                const telemetry = telemetryByPolicy.get(policy.policy_id);
                const reasons = telemetry?.dataQualityReasons ?? ['NO_TELEMETRY'];
                const deployed = telemetry?.deployedCohorts?.join(', ') ?? 'Unknown';
                const decisionWindowCount =
                  (telemetry?.decisionCounts.allow ?? 0)
                  + (telemetry?.decisionCounts.block ?? 0)
                  + (telemetry?.decisionCounts.no_op ?? 0)
                  + (telemetry?.decisionCounts.unknown ?? 0);
                const decisionActivity = telemetryStatus === 'OFF'
                  ? 'Unknown'
                  : decisionWindowCount > 0
                    ? 'Active'
                    : 'None';
                const coverage = telemetry?.coveragePct ?? null;
                const coverageLabel = coverage === null ? 'Unknown' : formatCoverage(coverage);
                const expanded = selectedPolicyId === policy.policy_id;
                const reportingMachines = telemetry?.reportingMachinesCount ?? null;
                const sampleValid = reportingMachines !== null
                  && reportingMachines >= POLICY_MIN_SAMPLE_MACHINES;

                return (
                  <Fragment key={policy.policy_id}>
                    <tr
                      className={expanded ? 'machine-selected-row click-row' : 'click-row'}
                      onClick={() => setSelectedPolicyId((current) => (current === policy.policy_id ? undefined : policy.policy_id))}
                    >
                      <td>{policy.name}</td>
                      <td>{policy.version}</td>
                      <td><span className={policyStatusTone(policy)}>{policy.active_flag ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <span className={signatureTone(telemetry?.signatureStatus ?? 'UNKNOWN')}>
                          {telemetry?.signatureStatus ?? 'UNKNOWN'}
                        </span>
                      </td>
                      <td title={deployed === 'Unknown' ? primaryReason(reasons) : undefined}>{deployed}</td>
                      <td title={decisionActivity === 'Unknown' ? primaryReason(reasons) : undefined}>{decisionActivity}</td>
                      <td title={coverageLabel === 'Unknown' ? primaryReason(reasons) : undefined}>{coverageLabel}</td>
                      <td>
                        <div className="button-row">
                          <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedPolicyId(policy.policy_id); }}>View</button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); handleDiffVersions(policy); }}>Diff versions</button>
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); void handleDeploy(policy); }}
                            disabled={!canDeploy || actionLoading}
                            title={!canDeploy ? 'Requires operator/admin' : undefined}
                          >
                            Deploy
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={(event) => { event.stopPropagation(); void handleDisable(policy); }}
                            disabled={!canDisable || actionLoading || !policy.active_flag}
                            title={!canDisable ? 'Requires admin' : undefined}
                          >
                            Disable
                          </button>
                        </div>
                        {diffNotice?.policyId === policy.policy_id ? (
                          <p className="policy-inline-toast">{diffNotice.text}</p>
                        ) : null}
                      </td>
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={8} className="policy-row-details-cell">
                          <div className="policy-row-details">
                            <header className="policy-row-details-header">
                              <h4>Policy details</h4>
                              <button
                                type="button"
                                onClick={() => setSelectedPolicyId(undefined)}
                              >
                                Collapse
                              </button>
                            </header>
                            <section className="policy-detail-section">
                              <h4>Identity</h4>
                              <p>Name: <strong>{policy.name}</strong></p>
                              <p>ID: <strong>{policy.policy_id}</strong></p>
                              <p>Version: <strong>{policy.version}</strong></p>
                              <p>Status: <strong>{policy.active_flag ? 'Active' : 'Inactive'}</strong></p>
                              <p>Signed: <strong>{telemetry?.signatureStatus ?? 'UNKNOWN'}</strong></p>
                              <p>Last updated: <strong>{formatUtc(policy.last_modified)}</strong> by <strong>{policy.created_by}</strong></p>
                            </section>

                            <section className="policy-detail-section">
                              <h4>Deployment Scope</h4>
                              <p>Cohorts enabled: <strong>{deployed}</strong></p>
                              <p>Service scope: <strong>{policy.service_scope}</strong></p>
                              <p>Environment scope: <strong>{policy.environment_scope}</strong></p>
                              <p>Effective policy seq: <strong>{policy.version}</strong></p>
                              <p>Feature gate dependencies: <strong>n/a</strong></p>
                              {!telemetry?.deployedCohorts ? (
                                <details className="policy-detail-reasons">
                                  <summary>Details</summary>
                                  <p className="muted-line">Reason code: NO_DEPLOYMENT_INFO</p>
                                </details>
                              ) : null}
                            </section>

                            <section className="policy-detail-section">
                              <h4>Runtime Coverage</h4>
                              <p>Machines eligible: <strong>{telemetry?.eligibleMachinesCount ?? 'n/a'}</strong></p>
                              <p>Machines reporting: <strong>{telemetry?.reportingMachinesCount ?? 'n/a'}</strong></p>
                              <p>Coverage: <strong>{formatCoverage(telemetry?.coveragePct ?? null)}</strong> (min {POLICY_MIN_COVERAGE_PCT.toFixed(1)}%)</p>
                              <p>Freshness: <strong>{telemetry?.freshnessSeconds === null || telemetry?.freshnessSeconds === undefined ? 'n/a' : `${telemetry.freshnessSeconds}s`}</strong></p>
                              <p>Verdict: <strong>{telemetry?.dataQualityVerdict ?? 'INCONCLUSIVE'}</strong></p>
                              {telemetry?.dataQualityVerdict !== 'OK' ? (
                                <div className="focus-banner">
                                  <p>Why metrics are unavailable: {summarizeReasons(telemetry?.dataQualityReasons ?? ['NO_TELEMETRY'])}</p>
                                  <details className="policy-detail-reasons">
                                    <summary>Show details</summary>
                                    <p className="muted-line">{(telemetry?.dataQualityReasons ?? ['NO_TELEMETRY']).join(', ')}</p>
                                  </details>
                                </div>
                              ) : null}
                            </section>

                            <section className="policy-detail-section">
                              <h4>Decision Activity</h4>
                              {sampleValid ? (
                                <>
                                  <p>Decisions/min (10m): <strong>{formatRate(telemetry?.decisionRatePerMin ?? null)}</strong></p>
                                  <p>Allow / Block / No-op / Unknown: <strong>
                                    {telemetry?.decisionCounts.allow ?? 0}
                                    {' / '}
                                    {telemetry?.decisionCounts.block ?? 0}
                                    {' / '}
                                    {telemetry?.decisionCounts.no_op ?? 0}
                                    {' / '}
                                    {telemetry?.decisionCounts.unknown ?? 0}
                                  </strong></p>
                                  <p>Average confidence: <strong>{formatNumber(telemetry?.avgConfidence ?? null)}</strong></p>
                                  <p>Last decision: <strong>{formatUtc(telemetry?.lastDecisionTs ?? undefined)}</strong></p>
                                  <p>Top cohorts: <strong>{(telemetry?.topCohorts?.length ?? 0) > 0
                                    ? telemetry?.topCohorts.map((row) => `${row.cohort} (${row.count})`).join(', ')
                                    : 'n/a'}</strong></p>
                                </>
                              ) : (
                                <div>
                                  <p className="muted-line">Decision activity unavailable: {summarizeReasons(telemetry?.dataQualityReasons ?? ['INSUFFICIENT_SAMPLE'])}</p>
                                  <details className="policy-detail-reasons">
                                    <summary>Show details</summary>
                                    <p className="muted-line">{(telemetry?.dataQualityReasons ?? ['INSUFFICIENT_SAMPLE']).join(', ')}</p>
                                  </details>
                                </div>
                              )}
                            </section>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {policies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted-line">No policy records available.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {!selectedPolicy ? (
            <p className="muted-line">Select a policy row to expand details. Policies define what PORTA is allowed to do and when.</p>
          ) : null}

          {compareEnabled ? (
            <section className="compare-panel">
              <h4>Compare Mode</h4>
              <div className="compare-control-row">
                <label>
                  Compare by
                  <select value={compareType} onChange={(event) => setCompareType(event.target.value as CompareType)}>
                    <option value="version">Policy version</option>
                    <option value="cohort">Cohort</option>
                  </select>
                </label>
                {compareType === 'version' ? (
                  <>
                    <label>
                      Left
                      <select value={compareLeft} onChange={(event) => setCompareLeft(event.target.value)}>
                        {policyOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Right
                      <select value={compareRight} onChange={(event) => setCompareRight(event.target.value)}>
                        {policyOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Left cohort
                      <select value={compareLeft} onChange={(event) => setCompareLeft(event.target.value)}>
                        {cohortOptions.map((cohort) => (
                          <option key={cohort} value={cohort}>{cohort}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Right cohort
                      <select value={compareRight} onChange={(event) => setCompareRight(event.target.value)}>
                        {cohortOptions.map((cohort) => (
                          <option key={cohort} value={cohort}>{cohort}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
              {comparePayload ? (
                comparePayload.inconclusive ? (
                  <p className="focus-banner">Compare unavailable: one or both sides are inconclusive on data quality.</p>
                ) : (
                  <table className="simple-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>{comparePayload.leftLabel}</th>
                        <th>{comparePayload.rightLabel}</th>
                        <th>Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Decision rate (per min)</td>
                        <td>{formatRate(comparePayload.left.decisionRatePerMin)}</td>
                        <td>{formatRate(comparePayload.right.decisionRatePerMin)}</td>
                        <td>
                          {comparePayload.left.decisionRatePerMin !== null && comparePayload.right.decisionRatePerMin !== null
                            ? round(comparePayload.left.decisionRatePerMin - comparePayload.right.decisionRatePerMin, 2)
                            : 'n/a'}
                        </td>
                      </tr>
                      <tr>
                        <td>Average confidence</td>
                        <td>{formatNumber(comparePayload.left.avgConfidence)}</td>
                        <td>{formatNumber(comparePayload.right.avgConfidence)}</td>
                        <td>
                          {comparePayload.left.avgConfidence !== null && comparePayload.right.avgConfidence !== null
                            ? round(comparePayload.left.avgConfidence - comparePayload.right.avgConfidence, 3)
                            : 'n/a'}
                        </td>
                      </tr>
                      <tr>
                        <td>Intervention count</td>
                        <td>{comparePayload.left.decisionCounts.allow}</td>
                        <td>{comparePayload.right.decisionCounts.allow}</td>
                        <td>{comparePayload.left.decisionCounts.allow - comparePayload.right.decisionCounts.allow}</td>
                      </tr>
                      <tr>
                        <td>Outcome distribution (Allow/Block/No-op)</td>
                        <td>
                          {comparePayload.distribution.left.allow ?? 'n/a'}% / {comparePayload.distribution.left.block ?? 'n/a'}% / {comparePayload.distribution.left.no_op ?? 'n/a'}%
                        </td>
                        <td>
                          {comparePayload.distribution.right.allow ?? 'n/a'}% / {comparePayload.distribution.right.block ?? 'n/a'}% / {comparePayload.distribution.right.no_op ?? 'n/a'}%
                        </td>
                        <td>n/a</td>
                      </tr>
                    </tbody>
                  </table>
                )
              ) : (
                <p className="muted-line">Select two policies/cohorts to compare.</p>
              )}
            </section>
          ) : null}
        </Panel>
      ) : null}

      {tab === 'decisions' ? (
        <Panel title="Decisions and Replay">
          <div className="table-controls">
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
                {policyOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Outcome
              <select
                value={decisionFilter}
                onChange={(event) => {
                  const next = parseDecisionFilter(event.target.value);
                  setDecisionFilter(next);
                  updateParam('outcome', next, 'all');
                }}
              >
                <option value="all">All</option>
                <option value="allow">Allow</option>
                <option value="block">Block</option>
                <option value="no_op">No-op</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label>
              Confidence &gt;=
              <input type="range" min={0} max={1} step={0.05} value={confidenceMin} onChange={(event) => setConfidenceMin(Number(event.target.value))} disabled={disableConfidence} />
              <span>{confidenceMin.toFixed(2)}</span>
            </label>
            <label>
              Time range
              <select
                value={timeRange}
                onChange={(event) => {
                  const next = parseTimeRange(event.target.value);
                  setTimeRange(next);
                  updateParam('window', next, '1h');
                }}
              >
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="6h">6h</option>
                <option value="24h">24h</option>
              </select>
            </label>
            <label>
              Cohort
              <select value={cohortFilter} onChange={(event) => setCohortFilter(event.target.value)}>
                <option value="all">All cohorts</option>
                {cohortOptions.map((cohort) => (
                  <option key={cohort} value={cohort}>{cohort}</option>
                ))}
              </select>
            </label>
            <input
              className="table-search-input"
              placeholder="Machine ID"
              value={machineFilter}
              onChange={(event) => {
                setMachineFilter(event.target.value);
                updateParam('agent', event.target.value);
              }}
            />
            <input
              className="table-search-input"
              placeholder="Reason code"
              value={reasonCodeFilter}
              onChange={(event) => setReasonCodeFilter(event.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={onlyWithReplayEvidence}
                disabled={disableReplayOnly}
                onChange={(event) => setOnlyWithReplayEvidence(event.target.checked)}
              />
              Only decisions with replay evidence
            </label>
          </div>
          {telemetryStatus === 'OFF' ? (
            <div className="focus-banner">
              <p>Decision telemetry is not enabled. Enable decision events from agents to see decisions and replay.</p>
              <details className="policy-detail-reasons">
                <summary>Details</summary>
                <p className="muted-line">reason code: NO_TELEMETRY</p>
                <p className="muted-line">last telemetry seen: n/a</p>
                <p className="muted-line">pipeline status: unknown</p>
              </details>
            </div>
          ) : null}
          {telemetryStatus === 'ON_EMPTY' ? (
            <p className="focus-banner">No decisions recorded in this time range.</p>
          ) : null}

          <div className="policy-summary-strip">
            <p>
              Results: {policyDecisionRows.length} | Last decision seen:{' '}
              {decisionLatestTimestamp ? formatUtc(decisionLatestTimestamp) : 'n/a'} | Telemetry: {telemetryLabel}
            </p>
            {policyDecisionRows.length === 0 && telemetryStatus === 'ON_WITH_DATA' ? (
              <p className="muted-line">No decisions match current filters.</p>
            ) : null}
            <p className="muted-line">
              Sample size: {decisionBaseSampleSize} | Freshness: {decisionFreshnessSeconds === null ? 'n/a' : `${decisionFreshnessSeconds}s`}
              {decisionCoveragePct !== null ? ` | Coverage: ${formatCoverage(decisionCoveragePct)}` : ''}
            </p>
          </div>

          <table className="simple-table">
            <thead>
              <tr>
                <th>timestamp</th>
                <th>machine</th>
                <th>cohort</th>
                <th>policy</th>
                <th>decision</th>
                <th>confidence</th>
                <th>reason_code</th>
                <th>correlation_id</th>
                <th>trace_id</th>
                <th>replay</th>
              </tr>
            </thead>
            <tbody>
              {policyDecisionRows.map((entry, index) => {
                const signatureInvalid = entry.row.signature_status === 'INVALID' || entry.row.signature_valid === false;
                return (
                  <tr key={`${entry.row.trace_id || entry.row.correlation_id || index}`} className={signatureInvalid ? 'row-alert' : undefined}>
                    <td>{formatUtc(entry.row.timestamp)}</td>
                    <td>{entry.machine}</td>
                    <td>{entry.cohort ?? 'n/a'}</td>
                    <td>{entry.row.policy_id}</td>
                    <td title={signatureInvalid ? 'Signature invalid' : undefined}>
                      {outcomeLabel(entry.outcome)}{signatureInvalid ? ' !' : ''}
                    </td>
                    <td>{entry.row.confidence_score.toFixed(2)}</td>
                    <td>{entry.reasonCode}</td>
                    <td>
                      {entry.row.correlation_id ? (
                        <a className="inline-button-link" href={`/audit-traces?correlation=${encodeURIComponent(entry.row.correlation_id)}`}>
                          {entry.row.correlation_id}
                        </a>
                      ) : (
                        'n/a'
                      )}
                    </td>
                    <td>{entry.row.trace_id || 'n/a'}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void runReplay(entry)}
                        disabled={!entry.row.trace_id}
                        title={!entry.row.trace_id ? 'No trace generated' : 'Replay decision'}
                      >
                        Replay
                      </button>
                    </td>
                  </tr>
                );
              })}
              {policyDecisionRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="muted-line">No decisions matched the current filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <section className="policy-replay-panel">
            <h4>Replay</h4>
            {selectedDecision ? (
              <div className="ops-grid">
                <div className="timeline-side">
                  <h4>Replay Summary</h4>
                  <ul className="kv-list">
                    <li><span>Decision</span><strong>{outcomeLabel(selectedDecision.outcome)}</strong></li>
                    <li><span>Confidence</span><strong>{selectedDecision.row.confidence_score.toFixed(2)}</strong></li>
                    <li><span>Reason</span><strong>{selectedDecision.reasonCode}</strong></li>
                    <li><span>Policy version</span><strong>{selectedDecision.row.policy_version ?? 'n/a'}</strong></li>
                    <li><span>Machine / cohort</span><strong>{selectedDecision.machine} / {selectedDecision.cohort ?? 'n/a'}</strong></li>
                    <li><span>Time</span><strong>{formatUtc(selectedDecision.row.timestamp)}</strong></li>
                    <li><span>Replay verification</span><strong>
                      {replayLoading ? 'Running...' : replayResult ? `${replayResult.result} (${replayResult.details})` : replayError ?? 'n/a'}
                    </strong></li>
                  </ul>
                </div>

                <div className="timeline-side">
                  <h4>Decision Chain</h4>
                  <div className="policy-chain-list">
                    <p><strong>Inputs/Signals summary</strong>: {rawTraceSummary(selectedDecision.row)}</p>
                    <p><strong>Primitive snapshot</strong>: {selectedDecision.row.contributing_primitives.length > 0 ? selectedDecision.row.contributing_primitives.join(', ') : 'n/a'}</p>
                    <p><strong>State snapshot</strong>: confidence {selectedDecision.row.confidence_score.toFixed(2)}</p>
                    <p><strong>Policy evaluation</strong>: threshold checks from policy {selectedDecision.row.policy_id}</p>
                    <p><strong>Escalation level chosen</strong>: {selectedDecision.row.action_decision}</p>
                    <p><strong>Intervention executed</strong>: {selectedDecision.outcome === 'allow' ? 'yes' : 'no'}</p>
                    <p><strong>Outcome recorded</strong>: {outcomeLabel(selectedDecision.outcome)}</p>
                  </div>

                  <h4>Evidence</h4>
                  <p className="muted-line">
                    Correlation ID: {selectedDecision.row.correlation_id || 'n/a'}
                  </p>
                  <div className="button-row">
                    <a
                      className="inline-button-link"
                      href={`/audit-traces?correlation=${encodeURIComponent(selectedDecision.row.correlation_id || '')}`}
                    >
                      Open correlation traces
                    </a>
                    <button
                      type="button"
                      onClick={exportTracePack}
                      disabled={!selectedDecision.row.trace_id && !selectedDecision.row.correlation_id}
                      title={!selectedDecision.row.trace_id && !selectedDecision.row.correlation_id ? 'No evidence available' : 'Export trace pack'}
                    >
                      Export trace pack
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted-line">Select a decision row and click Replay to inspect the chain and evidence.</p>
            )}
          </section>
        </Panel>
      ) : null}
    </div>
  );
}
