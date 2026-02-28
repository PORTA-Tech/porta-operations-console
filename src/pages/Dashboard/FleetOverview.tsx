import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFleetSlice } from '../../store/fleetSlice';
import { formatUtc } from '../../utils/date';
import { useActiveConfigIntegrity } from '../../hooks/useActiveConfigIntegrity';
import { useWsConnectionStatus } from '../../hooks/useWsConnectionStatus';
import { fetchAuditDecisions, fetchConsoleOpsMetrics, fetchPolicies } from '../../api/operations';
import type { AuditDecisionRecord, PolicyRecord } from '../../types/consoleOperations';
import { getNodeSnapshot, type NodeSnapshotRow } from '../../api/nodes';
import { getCohortSummary, type CohortSummary } from '../../api/cohorts';
import { getAdapterControls, type AdapterActivationControlsView } from '../../api/adapter';

type IndicatorTone = 'ok' | 'warn' | 'critical';
type CohortWindow = '15m' | '1h' | '6h' | '24h';
type CompareMetric = 'error' | 'p99' | 'degradation';

interface StatusIndicatorView {
  label: string;
  tone: IndicatorTone;
  detail: string;
  targetPath: string;
}

interface AttentionItem {
  key: string;
  severity: IndicatorTone;
  title: string;
  detail: string;
  actionLabel: string;
  targetPath: string;
}

interface ChangeFeedEntry {
  key: string;
  timestampUtc: string;
  summary: string;
  targetPath: string;
}

interface FleetKpiSnapshot {
  errorRatePct: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  degradationPct: number;
  onlineNodes: number;
  totalNodes: number;
  policyDecisionsPerMinute: number;
  interventionsPerMinute: number;
}

const OFFLINE_HEARTBEAT_THRESHOLD_MS = 2 * 60 * 1000;

function isMachineOffline(lastHeartbeatUtc: string): boolean {
  const heartbeatMs = Date.parse(lastHeartbeatUtc);
  if (Number.isNaN(heartbeatMs)) {
    return true;
  }

  return (Date.now() - heartbeatMs) > OFFLINE_HEARTBEAT_THRESHOLD_MS;
}

function mapRolloutStatus(state: string | undefined): StatusIndicatorView {
  if (state === 'PROMOTING') {
    return {
      label: 'Promoting',
      tone: 'warn',
      detail: 'Changes are deploying now.',
      targetPath: '/rollouts'
    };
  }

  if (state === 'MONITORING') {
    return {
      label: 'Monitoring',
      tone: 'warn',
      detail: 'Promotion paused for checks.',
      targetPath: '/rollouts'
    };
  }

  if (state === 'HALTED' || state === 'ROLLED_BACK' || state === 'COOLDOWN') {
    return {
      label: 'Halted',
      tone: 'critical',
      detail: 'Promotion blocked or rolled back.',
      targetPath: '/rollouts'
    };
  }

  return {
    label: 'Idle',
    tone: 'ok',
    detail: 'No promotion running.',
    targetPath: '/rollouts'
  };
}

function mapSloStatus(label: 'Compliant' | 'Degraded' | 'Breached'): StatusIndicatorView {
  if (label === 'Compliant') {
    return {
      label: 'Compliant',
      tone: 'ok',
      detail: 'Targets met.',
      targetPath: '/cohorts'
    };
  }

  return {
    label: 'Breach',
    tone: 'critical',
    detail: 'Targets are breached.',
    targetPath: '/alerts'
  };
}

function mapTrustStatus(
  integrity: ReturnType<typeof useActiveConfigIntegrity>['data'],
  integrityError: ReturnType<typeof useActiveConfigIntegrity>['error']
): StatusIndicatorView {
  if (integrityError || !integrity) {
    return {
      label: 'Warning',
      tone: 'warn',
      detail: 'Trust signal is unavailable.',
      targetPath: '/config'
    };
  }

  if (!integrity.signature_validity || integrity.integrity_status === 'invalid_or_expired') {
    return {
      label: 'Invalid',
      tone: 'critical',
      detail: 'Signature check failed.',
      targetPath: '/config'
    };
  }

  if (integrity.integrity_status === 'expiry_approaching') {
    return {
      label: 'Warning',
      tone: 'warn',
      detail: 'Signature near expiry.',
      targetPath: '/config'
    };
  }

  return {
    label: 'Trusted',
    tone: 'ok',
    detail: 'Signatures valid.',
    targetPath: '/config'
  };
}

function rankSeverity(severity: IndicatorTone): number {
  if (severity === 'critical') return 3;
  if (severity === 'warn') return 2;
  return 1;
}

function weightedAverage(rows: CohortSummary[], selector: (row: CohortSummary) => number): number {
  const totalWeight = rows.reduce((sum, row) => sum + row.nodeCount, 0);
  if (totalWeight <= 0) {
    return 0;
  }

  const weightedSum = rows.reduce((sum, row) => sum + (selector(row) * row.nodeCount), 0);
  return weightedSum / totalWeight;
}

function polylinePoints(values: number[]): string {
  if (values.length === 0) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);

  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 92 - ((value - min) / range) * 84;
      return `${x},${y}`;
    })
    .join(' ');
}

function metricSeries(summary: CohortSummary | undefined, metric: CompareMetric): number[] {
  if (!summary) {
    return [];
  }

  if (metric === 'p99') {
    return summary.trend.map((point) => point.p99LatencyMs);
  }

  if (metric === 'degradation') {
    return summary.trend.map((point) => point.degradationRatePct);
  }

  return summary.trend.map((point) => point.errorRatePct);
}

function metricLabel(metric: CompareMetric): string {
  if (metric === 'p99') return 'P99 latency';
  if (metric === 'degradation') return 'Performance regression';
  return 'Error rate';
}

function formatMetricValue(metric: CompareMetric, value: number): string {
  if (metric === 'p99') {
    return `${Math.round(value)} ms`;
  }

  return `${value.toFixed(3)}%`;
}

export function FleetOverview() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rollout = useFleetSlice((s) => s.rollout);
  const cohorts = useFleetSlice((s) => s.cohortDistribution);
  const sloCompliance = useFleetSlice((s) => s.sloCompliance);
  const lastUpdatedUtc = useFleetSlice((s) => s.lastUpdatedUtc);
  const liveConnected = useFleetSlice((s) => s.liveConnected);
  const { data: integrityData, error: integrityError } = useActiveConfigIntegrity();
  const wsStatus = useWsConnectionStatus();

  const compareMode = params.get('compare') ?? 'none';
  const compareEnabled = compareMode !== 'none';
  const compareLeft = params.get('cmpA') ?? 'stable';
  const compareRight = params.get('cmpB') ?? 'experimental';
  const compareWindow = (params.get('cmpWindow') ?? '1h') as CohortWindow;
  const compareMetric = (params.get('cmpMetric') ?? 'error') as CompareMetric;

  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [nodes, setNodes] = useState<NodeSnapshotRow[]>([]);
  const [cohortSummaries, setCohortSummaries] = useState<CohortSummary[]>([]);
  const [auditDecisions, setAuditDecisions] = useState<AuditDecisionRecord[]>([]);
  const [adapterControls, setAdapterControls] = useState<AdapterActivationControlsView | undefined>(undefined);
  const [changeFeedEvents, setChangeFeedEvents] = useState<ChangeFeedEntry[]>([]);
  const [decisionRateFromMetrics, setDecisionRateFromMetrics] = useState(0);
  const [rbacViolationDelta, setRbacViolationDelta] = useState(0);
  const [lastRefreshUtc, setLastRefreshUtc] = useState<string | undefined>(undefined);

  const previousRbacViolationsRef = useRef<number | null>(null);
  const previousAuditQueriesRef = useRef<number | null>(null);
  const previousMetricsTimestampRef = useRef<number | null>(null);
  const previousPolicyVersionsRef = useRef<Map<string, string>>(new Map());
  const previousPolicyThresholdsRef = useRef<Map<string, string>>(new Map());
  const previousRolloutStateRef = useRef<string | undefined>(undefined);
  const previousConfigSeqRef = useRef<number | undefined>(undefined);
  const previousFeatureGateRef = useRef<boolean | undefined>(undefined);
  const rolloutRef = useRef(rollout);

  const updateParam = (key: string, value: string, clearValue?: string) => {
    const next = new URLSearchParams(params);
    if (value === '' || (clearValue && value === clearValue)) {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    setParams(next, { replace: true });
  };

  const rolloutStatus = mapRolloutStatus(rollout?.state);
  const sloStatus = mapSloStatus(sloCompliance.label);
  const trustStatus = mapTrustStatus(integrityData, integrityError);

  useEffect(() => {
    rolloutRef.current = rollout;
  }, [rollout]);

  useEffect(() => {
    let mounted = true;

    const pushChangeEvents = (events: ChangeFeedEntry[]) => {
      if (events.length === 0) {
        return;
      }

      setChangeFeedEvents((current) => (
        [...events, ...current]
          .sort((a, b) => Date.parse(b.timestampUtc) - Date.parse(a.timestampUtc))
          .slice(0, 20)
      ));
    };

    const refreshSignals = async () => {
      try {
        const [nextPolicies, nextNodes, nextMetrics, nextCohorts, nextAuditDecisions, nextAdapterControls] = await Promise.all([
          fetchPolicies().catch(() => []),
          getNodeSnapshot().catch(() => []),
          fetchConsoleOpsMetrics().catch(() => ({
            policy_changes_total: 0,
            policy_deploy_failures_total: 0,
            audit_queries_total: 0,
            audit_signature_mismatch_total: 0,
            rbac_violations_total: 0,
            correlation_trace_complete_total: 0,
            correlation_trace_incomplete_total: 0,
            alerts_triggered_total: 0
          })),
          getCohortSummary(compareWindow).catch(() => []),
          fetchAuditDecisions().catch(() => []),
          getAdapterControls().catch(() => undefined)
        ]);

        if (!mounted) return;

        setPolicies(nextPolicies);
        setNodes(nextNodes);
        setCohortSummaries(nextCohorts);
        setAuditDecisions(nextAuditDecisions);
        setAdapterControls(nextAdapterControls);
        setLastRefreshUtc(new Date().toISOString());

        const previousRbac = previousRbacViolationsRef.current;
        const currentRbac = nextMetrics.rbac_violations_total;
        if (previousRbac !== null && currentRbac > previousRbac) {
          setRbacViolationDelta(currentRbac - previousRbac);
        } else {
          setRbacViolationDelta(0);
        }
        previousRbacViolationsRef.current = currentRbac;

        const nowMs = Date.now();
        const previousMetricsTs = previousMetricsTimestampRef.current;
        const previousAuditQueries = previousAuditQueriesRef.current;
        if (previousMetricsTs !== null && previousAuditQueries !== null) {
          const elapsedMinutes = (nowMs - previousMetricsTs) / 60000;
          const delta = Math.max(0, nextMetrics.audit_queries_total - previousAuditQueries);
          if (elapsedMinutes > 0) {
            setDecisionRateFromMetrics(delta / elapsedMinutes);
          }
        }
        previousMetricsTimestampRef.current = nowMs;
        previousAuditQueriesRef.current = nextMetrics.audit_queries_total;

        const detectedEvents: ChangeFeedEntry[] = [];
        const currentRollout = rolloutRef.current;
        const rolloutState = currentRollout?.state;
        const configSeq = currentRollout?.activeConfigSeq;

        if (previousRolloutStateRef.current && rolloutState && previousRolloutStateRef.current !== rolloutState) {
          detectedEvents.push({
            key: `rollout-stage-${currentRollout?.updatedAtUtc ?? nowMs}`,
            timestampUtc: currentRollout?.updatedAtUtc ?? new Date(nowMs).toISOString(),
            summary: `Rollout stage changed: ${previousRolloutStateRef.current} -> ${rolloutState}.`,
            targetPath: '/rollouts'
          });
        }

        if (
          previousConfigSeqRef.current !== undefined
          && configSeq !== undefined
          && previousConfigSeqRef.current !== configSeq
        ) {
          detectedEvents.push({
            key: `config-seq-${currentRollout?.updatedAtUtc ?? nowMs}`,
            timestampUtc: currentRollout?.updatedAtUtc ?? new Date(nowMs).toISOString(),
            summary: `config_seq changed: ${previousConfigSeqRef.current} -> ${configSeq}.`,
            targetPath: '/config'
          });
        }

        const nextVersionMap = new Map(nextPolicies.map((policy) => [policy.policy_id, policy.version]));
        const previousVersionMap = previousPolicyVersionsRef.current;
        for (const policy of nextPolicies) {
          const previousVersion = previousVersionMap.get(policy.policy_id);
          if (previousVersion && previousVersion !== policy.version) {
            detectedEvents.push({
              key: `policy-version-${policy.policy_id}-${policy.version}`,
              timestampUtc: policy.last_modified,
              summary: `New policy version deployed: ${policy.name} v${policy.version}.`,
              targetPath: '/policies'
            });
          }
        }
        previousPolicyVersionsRef.current = nextVersionMap;

        const nextThresholdMap = new Map(
          nextPolicies.map((policy) => [
            policy.policy_id,
            [
              policy.trigger_threshold,
              policy.dwell_window_seconds,
              policy.cooldown_seconds,
              policy.max_interventions_per_hour
            ].join(':')
          ])
        );
        const previousThresholdMap = previousPolicyThresholdsRef.current;
        for (const policy of nextPolicies) {
          const previousThresholdSignature = previousThresholdMap.get(policy.policy_id);
          const nextThresholdSignature = nextThresholdMap.get(policy.policy_id);
          if (previousThresholdSignature && nextThresholdSignature && previousThresholdSignature !== nextThresholdSignature) {
            detectedEvents.push({
              key: `policy-threshold-${policy.policy_id}-${policy.last_modified}`,
              timestampUtc: policy.last_modified,
              summary: `Threshold tuning applied: ${policy.name} trigger/dwell/cooldown updated.`,
              targetPath: '/policies'
            });
          }
        }
        previousPolicyThresholdsRef.current = nextThresholdMap;

        const currentFeatureGate = nextAdapterControls?.feature_gate_enabled;
        if (
          previousFeatureGateRef.current !== undefined
          && currentFeatureGate !== undefined
          && previousFeatureGateRef.current !== currentFeatureGate
        ) {
          detectedEvents.push({
            key: `feature-gate-${nextAdapterControls?.updated_at_utc ?? nowMs}`,
            timestampUtc: nextAdapterControls?.updated_at_utc ?? new Date(nowMs).toISOString(),
            summary: `Feature gate toggled: ${currentFeatureGate ? 'enabled' : 'disabled'}.`,
            targetPath: '/rollouts'
          });
        }
        previousFeatureGateRef.current = currentFeatureGate;

        previousRolloutStateRef.current = rolloutState;
        previousConfigSeqRef.current = configSeq;
        pushChangeEvents(detectedEvents);
      } catch {
        if (!mounted) return;
      }
    };

    void refreshSignals();
    const timer = window.setInterval(() => {
      void refreshSignals();
    }, 3000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [compareWindow]);

  const fleetStatus = useMemo<StatusIndicatorView>(() => {
    if (!liveConnected || !wsStatus.connected || trustStatus.label === 'Invalid' || sloStatus.label === 'Breach') {
      return {
        label: 'Incident',
        tone: 'critical',
        detail: 'Critical signal failing.',
        targetPath: '/alerts'
      };
    }

    if (rolloutStatus.label !== 'Idle' || trustStatus.label === 'Warning') {
      return {
        label: 'Degraded',
        tone: 'warn',
        detail: 'Needs operator review.',
        targetPath: '/cohorts'
      };
    }

    return {
      label: 'Healthy',
      tone: 'ok',
      detail: 'No critical issues.',
      targetPath: '/cohorts'
    };
  }, [liveConnected, rolloutStatus.label, sloStatus.label, trustStatus.label, wsStatus.connected]);

  const latestPolicy = [...policies].sort((a, b) => Date.parse(b.last_modified) - Date.parse(a.last_modified))[0];

  const offlineMachinesCount = nodes.filter((node) => isMachineOffline(node.last_heartbeat)).length;
  const signatureInvalidMachinesCount = nodes.filter((node) => !node.signature_valid).length;
  const rolloutBlockedByCooldown = Boolean(
    rollout?.state === 'COOLDOWN'
    || (rollout?.cooldownUntilUtc && Date.parse(rollout.cooldownUntilUtc) > Date.now())
  );
  const affectedMachinesCount = signatureInvalidMachinesCount > 0 ? signatureInvalidMachinesCount : offlineMachinesCount;
  const affectedMachinesPath = signatureInvalidMachinesCount > 0
    ? '/machines?signature=invalid'
    : offlineMachinesCount > 0
      ? '/machines?offline=1'
      : '/machines';

  const experimentalDegraded = useMemo(() => {
    const experimental = cohortSummaries.find((row) => row.cohortId === 'experimental');
    const stable = cohortSummaries.find((row) => row.cohortId === 'stable');
    if (!experimental || !stable) {
      return false;
    }

    return (
      experimental.degradationRatePct > stable.degradationRatePct + 0.2
      || experimental.errorRatePct > stable.errorRatePct + 0.1
    );
  }, [cohortSummaries]);

  const needsAttention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];

    if (offlineMachinesCount > 0) {
      items.push({
        key: 'machines-offline',
        severity: 'critical',
        title: `${offlineMachinesCount} machines offline`,
        detail: `Heartbeat older than ${Math.round(OFFLINE_HEARTBEAT_THRESHOLD_MS / 1000)}s.`,
        actionLabel: 'View machines',
        targetPath: '/machines?offline=1'
      });
    }

    if (signatureInvalidMachinesCount > 0) {
      items.push({
        key: 'signature-invalid',
        severity: 'critical',
        title: `Signature invalid on ${signatureInvalidMachinesCount} machines`,
        detail: 'Trust check failed on machine snapshots.',
        actionLabel: 'View machines',
        targetPath: '/machines?signature=invalid'
      });
    }

    if (experimentalDegraded) {
      items.push({
        key: 'experimental-degraded',
        severity: 'warn',
        title: "Cohort 'experimental' degraded",
        detail: 'Experimental underperforming versus stable baseline.',
        actionLabel: 'Open cohort compare',
        targetPath: '/cohorts?cohort=experimental&cohortCompare=1&cohortB=stable'
      });
    }

    if (rbacViolationDelta > 0) {
      items.push({
        key: 'rbac-increased',
        severity: 'warn',
        title: 'RBAC violations increased',
        detail: `+${rbacViolationDelta} violations since last refresh.`,
        actionLabel: 'View security events',
        targetPath: '/security-access?focus=rbac-violations'
      });
    }

    if (rolloutBlockedByCooldown) {
      items.push({
        key: 'rollout-cooldown',
        severity: 'warn',
        title: 'Rollout blocked by cooldown',
        detail: rollout?.cooldownUntilUtc
          ? `Cooldown until ${formatUtc(rollout.cooldownUntilUtc)}.`
          : 'Rollout is currently blocked by cooldown state.',
        actionLabel: 'Open rollouts',
        targetPath: '/rollouts?cooldown=active'
      });
    }

    return items.sort((a, b) => rankSeverity(b.severity) - rankSeverity(a.severity));
  }, [experimentalDegraded, offlineMachinesCount, rbacViolationDelta, rollout?.cooldownUntilUtc, rolloutBlockedByCooldown, signatureInvalidMachinesCount]);

  const fleetKpis = useMemo<FleetKpiSnapshot>(() => {
    const totalNodes = nodes.length;
    const onlineNodes = nodes.filter((node) => !isMachineOffline(node.last_heartbeat)).length;

    const errorRatePct = weightedAverage(cohortSummaries, (row) => row.errorRatePct);
    const latencyP95Ms = weightedAverage(cohortSummaries, (row) => row.latencyP95Ms);
    const latencyP99Ms = weightedAverage(cohortSummaries, (row) => row.latencyP99Ms);
    const degradationPct = weightedAverage(cohortSummaries, (row) => row.degradationRatePct);

    const oneMinuteAgo = Date.now() - 60_000;
    const recentDecisions = auditDecisions.filter((decision) => {
      const decisionMs = Date.parse(decision.timestamp);
      return Number.isFinite(decisionMs) && decisionMs >= oneMinuteAgo;
    });
    const recentInterventions = recentDecisions.filter((decision) => decision.action_decision === 'intervene');

    return {
      errorRatePct,
      latencyP95Ms,
      latencyP99Ms,
      degradationPct,
      onlineNodes,
      totalNodes,
      policyDecisionsPerMinute: recentDecisions.length > 0 ? recentDecisions.length : decisionRateFromMetrics,
      interventionsPerMinute: recentInterventions.length
    };
  }, [auditDecisions, cohortSummaries, decisionRateFromMetrics, nodes]);

  const changeFeed = useMemo<ChangeFeedEntry[]>(() => {
    const items: ChangeFeedEntry[] = [...changeFeedEvents];

    if (items.length === 0 && latestPolicy) {
      items.push({
        key: `baseline-policy-${latestPolicy.policy_id}-${latestPolicy.version}`,
        timestampUtc: latestPolicy.last_modified,
        summary: `New policy version deployed: ${latestPolicy.name} v${latestPolicy.version}.`,
        targetPath: '/policies'
      });
    }

    if (items.length === 0 && rollout?.updatedAtUtc) {
      items.push({
        key: `baseline-rollout-${rollout.updatedAtUtc}`,
        timestampUtc: rollout.updatedAtUtc,
        summary: `Rollout stage changed to ${rollout.state}.`,
        targetPath: '/rollouts'
      });
    }

    if (items.length === 0 && adapterControls?.updated_at_utc) {
      items.push({
        key: `baseline-feature-gate-${adapterControls.updated_at_utc}`,
        timestampUtc: adapterControls.updated_at_utc,
        summary: `Feature gate toggled: ${adapterControls.feature_gate_enabled ? 'enabled' : 'disabled'}.`,
        targetPath: '/rollouts'
      });
    }

    return items
      .sort((a, b) => Date.parse(b.timestampUtc) - Date.parse(a.timestampUtc))
      .slice(0, 8);
  }, [adapterControls, changeFeedEvents, latestPolicy, rollout]);

  const statusCards = [
    { title: 'Fleet', state: fleetStatus },
    { title: 'Rollout', state: rolloutStatus },
    { title: 'SLO', state: sloStatus },
    { title: 'Trust', state: trustStatus }
  ];

  const compareOptions = useMemo(
    () => cohortSummaries.map((row) => row.cohortId),
    [cohortSummaries]
  );
  const leftSummary = cohortSummaries.find((row) => row.cohortId === compareLeft) ?? cohortSummaries[0];
  const rightSummary = cohortSummaries.find((row) => row.cohortId === compareRight) ?? cohortSummaries[1] ?? cohortSummaries[0];

  const leftMetricValue = useMemo(() => {
    if (!leftSummary) return 0;
    if (compareMetric === 'p99') return leftSummary.latencyP99Ms;
    if (compareMetric === 'degradation') return leftSummary.degradationRatePct;
    return leftSummary.errorRatePct;
  }, [compareMetric, leftSummary]);

  const rightMetricValue = useMemo(() => {
    if (!rightSummary) return 0;
    if (compareMetric === 'p99') return rightSummary.latencyP99Ms;
    if (compareMetric === 'degradation') return rightSummary.degradationRatePct;
    return rightSummary.errorRatePct;
  }, [compareMetric, rightSummary]);

  const delta = leftMetricValue - rightMetricValue;
  const leftSeries = metricSeries(leftSummary, compareMetric);
  const rightSeries = metricSeries(rightSummary, compareMetric);

  const showInterventions = fleetKpis.interventionsPerMinute > 0;
  const openQuickCompare = () => {
    updateParam('compare', 'baseline-canary', 'none');
    updateParam('cmpA', compareOptions.includes('stable') ? 'stable' : (compareOptions[0] ?? 'stable'), 'stable');
    updateParam(
      'cmpB',
      compareOptions.includes('experimental') ? 'experimental' : (compareOptions[1] ?? compareOptions[0] ?? 'experimental'),
      'experimental'
    );
  };

  return (
    <div className="grid-three">
      <section className="panel span-all">
        <div className="fleet-snapshot-row">
          <div className="fleet-snapshot-text">
            <strong>{fleetStatus.label}</strong>
            <span>Trust: {trustStatus.label}</span>
            <span>Affected machines: {affectedMachinesCount}</span>
            <span>Live refresh: {formatUtc(lastRefreshUtc ?? lastUpdatedUtc ?? rollout?.updatedAtUtc)}</span>
          </div>
          <div className="fleet-snapshot-actions">
            <button type="button" onClick={() => navigate(affectedMachinesPath)}>
              Open affected machines
            </button>
            <button type="button" onClick={openQuickCompare}>
              Compare experimental vs stable
            </button>
          </div>
        </div>
      </section>

      <section className="panel span-all">
        <div className="panel-heading-row">
          <h3>Status</h3>
          <span className="muted-line">Critical health signals</span>
        </div>
        <div className="right-now-grid">
          {statusCards.map((card) => (
            <button
              key={card.title}
              type="button"
              className={`right-now-card ${card.state.tone}`}
              onClick={() => navigate(card.state.targetPath)}
              title={card.state.detail}
            >
              <span className="status-card-title">{card.title}</span>
              <strong className="right-now-value">{card.state.label.toUpperCase()}</strong>
              <span className="muted-line">{card.state.detail}</span>
            </button>
          ))}
        </div>
        <div className="status-badge-row">
          <span className="status-health-pill">Live: {liveConnected ? 'Connected' : 'Disconnected'}</span>
          <button
            type="button"
            className={`status-health-pill ${wsStatus.connected ? 'ok' : 'critical'}`}
            onClick={() => navigate('/system-health')}
          >
            WS: {wsStatus.statusLabel}
          </button>
          <span className="status-health-pill">Last update: {formatUtc(lastUpdatedUtc ?? rollout?.updatedAtUtc)}</span>
        </div>
      </section>

      <section className="panel span-all">
        <div className="panel-heading-row">
          <h3>Needs attention</h3>
          <span className="muted-line">Sorted by severity</span>
        </div>
        {needsAttention.length === 0 ? (
          <p className="muted-line">No active issues. Fleet appears stable.</p>
        ) : (
          <div className="needs-attention-list">
            {needsAttention.map((item) => (
              <div key={item.key} className="needs-attention-row">
                <div className="needs-attention-main">
                  <span className={`severity-dot ${item.severity}`} aria-hidden="true" />
                  <div>
                    <div className="needs-attention-title">{item.title}</div>
                    <div className="needs-attention-detail">{item.detail}</div>
                  </div>
                </div>
                <button type="button" onClick={() => navigate(item.targetPath)}>
                  {item.actionLabel}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel span-all">
        <div className="panel-heading-row">
          <h3>Key metrics</h3>
          <span className="muted-line">Fleet essentials only</span>
        </div>
        <div className="key-metrics-grid">
          <div className="kpi-tile">
            <span className="kpi-label">Error rate</span>
            <strong>{fleetKpis.errorRatePct.toFixed(3)}%</strong>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">P95 latency</span>
            <strong>{Math.round(fleetKpis.latencyP95Ms)} ms</strong>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">P99 latency</span>
            <strong>{Math.round(fleetKpis.latencyP99Ms)} ms</strong>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Regression %</span>
            <strong>{fleetKpis.degradationPct.toFixed(3)}%</strong>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Nodes online</span>
            <strong>{fleetKpis.onlineNodes}/{fleetKpis.totalNodes}</strong>
          </div>
          {showInterventions ? (
            <div className="kpi-tile">
              <span className="kpi-label">Interventions/min</span>
              <strong>{fleetKpis.interventionsPerMinute.toFixed(1)}</strong>
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel span-all">
        <div className="panel-heading-row">
          <h3>Cohort distribution</h3>
          <span className="muted-line">Exposure overview</span>
        </div>
        {cohorts.length === 0 ? (
          <p className="muted-line">No cohort data is available yet.</p>
        ) : (
          <table className="simple-table">
            <thead>
              <tr>
                <th>Cohort</th>
                <th>Exposure</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr
                  key={cohort.cohortId}
                  className="click-row"
                  onClick={() => navigate(`/cohorts?cohort=${encodeURIComponent(cohort.cohortId)}`)}
                >
                  <td>{cohort.cohortId}</td>
                  <td>{cohort.exposurePct}%</td>
                  <td>{cohort.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {compareEnabled ? (
        <section className="panel span-all">
          <div className="panel-heading-row">
            <h3>Compare</h3>
            <span className="muted-line">Baseline vs canary</span>
          </div>
          <div className="compare-control-row">
            <label>
              Left cohort
              <select value={compareLeft} onChange={(event) => updateParam('cmpA', event.target.value, 'stable')}>
                {compareOptions.map((cohort) => (
                  <option key={cohort} value={cohort}>{cohort}</option>
                ))}
              </select>
            </label>
            <label>
              Right cohort
              <select value={compareRight} onChange={(event) => updateParam('cmpB', event.target.value, 'experimental')}>
                {compareOptions.map((cohort) => (
                  <option key={cohort} value={cohort}>{cohort}</option>
                ))}
              </select>
            </label>
            <label>
              Time window
              <select value={compareWindow} onChange={(event) => updateParam('cmpWindow', event.target.value, '1h')}>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="6h">6h</option>
                <option value="24h">24h</option>
              </select>
            </label>
            <label>
              Metric
              <select value={compareMetric} onChange={(event) => updateParam('cmpMetric', event.target.value, 'error')}>
                <option value="error">Error</option>
                <option value="p99">P99</option>
                <option value="degradation">Regression</option>
              </select>
            </label>
          </div>

          <table className="simple-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>{leftSummary?.cohortId ?? compareLeft}</th>
                <th>{rightSummary?.cohortId ?? compareRight}</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{metricLabel(compareMetric)}</td>
                <td>{formatMetricValue(compareMetric, leftMetricValue)}</td>
                <td>{formatMetricValue(compareMetric, rightMetricValue)}</td>
                <td>{delta >= 0 ? '+' : ''}{formatMetricValue(compareMetric, delta)}</td>
              </tr>
            </tbody>
          </table>

          <div className="trend-panel">
            <h4>{metricLabel(compareMetric)} trend</h4>
            <svg viewBox="0 0 100 100" className="trend-svg" role="img" aria-label="Compare trend chart">
              <polyline className="trend-line-primary" fill="none" strokeWidth="2.5" points={polylinePoints(leftSeries)} />
              <polyline className="trend-line-secondary" fill="none" strokeWidth="2.5" points={polylinePoints(rightSeries)} />
            </svg>
          </div>
        </section>
      ) : null}

      <section className="panel span-all">
        <div className="panel-heading-row">
          <h3>Change feed</h3>
          <span className="muted-line">What changed since yesterday</span>
        </div>
        {changeFeed.length === 0 ? (
          <p className="muted-line">No recent changes recorded.</p>
        ) : (
          <ul className="change-feed-list">
            {changeFeed.map((entry) => (
              <li key={entry.key}>
                <button type="button" className="change-feed-item" onClick={() => navigate(entry.targetPath)}>
                  <strong>{formatUtc(entry.timestampUtc)}</strong>
                  <span>{entry.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
