import { useEffect, useMemo, useRef, useState } from 'react';
import { useFleetSlice } from '../../store/fleetSlice';
import { MetricCard } from '../../components/Tables/MetricCard';
import { formatUtc } from '../../utils/date';
import { useNavigate } from 'react-router-dom';
import { useActiveConfigIntegrity } from '../../hooks/useActiveConfigIntegrity';
import { useWsConnectionStatus } from '../../hooks/useWsConnectionStatus';
import { fetchAuditDecisions, fetchConsoleOpsMetrics, fetchPolicies } from '../../api/operations';
import type { AuditDecisionRecord, ConsoleOpsMetrics, PolicyRecord } from '../../types/consoleOperations';
import { getNodeSnapshot, type NodeSnapshotRow } from '../../api/nodes';
import { getCohortSummary, type CohortSummary } from '../../api/cohorts';
import { getAdapterControls, type AdapterActivationControlsView } from '../../api/adapter';

type IndicatorTone = 'ok' | 'warn' | 'critical';

interface StatusIndicatorView {
  label: string;
  tone: IndicatorTone;
  plainEnglish: string;
  detail: string;
  targetPath: string;
}

interface AttentionItem {
  key: string;
  severity: IndicatorTone;
  title: string;
  detail: string;
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
      plainEnglish: 'Are changes being deployed right now?',
      detail: 'Rollout is actively promoting changes.',
      targetPath: '/rollouts'
    };
  }

  if (state === 'MONITORING') {
    return {
      label: 'Monitoring',
      tone: 'warn',
      plainEnglish: 'Are changes being deployed right now?',
      detail: 'Rollout is paused for monitoring before the next stage.',
      targetPath: '/rollouts'
    };
  }

  if (state === 'HALTED' || state === 'ROLLED_BACK' || state === 'COOLDOWN') {
    return {
      label: 'Halted',
      tone: 'critical',
      plainEnglish: 'Are changes being deployed right now?',
      detail: 'Rollout is halted, rolled back, or blocked by cooldown.',
      targetPath: '/rollouts'
    };
  }

  return {
    label: 'Idle',
    tone: 'ok',
    plainEnglish: 'Are changes being deployed right now?',
    detail: 'No active rollout promotion at this moment.',
    targetPath: '/rollouts'
  };
}

function mapSloStatus(label: 'Compliant' | 'Degraded' | 'Breached'): StatusIndicatorView {
  if (label === 'Compliant') {
    return {
      label: 'Compliant',
      tone: 'ok',
      plainEnglish: 'Are we meeting reliability targets?',
      detail: 'SLO posture is healthy.',
      targetPath: '/cohorts'
    };
  }

  return {
    label: 'Breach',
    tone: 'critical',
    plainEnglish: 'Are we meeting reliability targets?',
    detail: 'SLO posture is degraded or breached.',
    targetPath: '/alerts'
  };
}

function mapTrustStatus(
  integrity: ReturnType<typeof useActiveConfigIntegrity>['data'],
  integrityError: ReturnType<typeof useActiveConfigIntegrity>['error']
): StatusIndicatorView {
  if (integrityError) {
    return {
      label: 'Warning',
      tone: 'warn',
      plainEnglish: 'Are configs/policies signed and valid?',
      detail: 'Trust telemetry is temporarily unavailable.',
      targetPath: '/config'
    };
  }

  if (!integrity) {
    return {
      label: 'Warning',
      tone: 'warn',
      plainEnglish: 'Are configs/policies signed and valid?',
      detail: 'Waiting for trust verification data.',
      targetPath: '/config'
    };
  }

  if (!integrity.signature_validity || integrity.integrity_status === 'invalid_or_expired') {
    return {
      label: 'Invalid',
      tone: 'critical',
      plainEnglish: 'Are configs/policies signed and valid?',
      detail: 'Signature check failed or active config expired.',
      targetPath: '/config'
    };
  }

  if (integrity.integrity_status === 'expiry_approaching') {
    return {
      label: 'Warning',
      tone: 'warn',
      plainEnglish: 'Are configs/policies signed and valid?',
      detail: 'Config signature is valid but nearing expiry.',
      targetPath: '/config'
    };
  }

  return {
    label: 'Trusted',
    tone: 'ok',
    plainEnglish: 'Are configs/policies signed and valid?',
    detail: 'Config signature and trust checks are valid.',
    targetPath: '/config'
  };
}

function rankSeverity(severity: IndicatorTone): number {
  if (severity === 'critical') return 3;
  if (severity === 'warn') return 2;
  return 1;
}

function weightedAverage(
  rows: CohortSummary[],
  selector: (row: CohortSummary) => number
): number {
  const totalWeight = rows.reduce((sum, row) => sum + row.nodeCount, 0);
  if (totalWeight <= 0) {
    return 0;
  }

  const weightedSum = rows.reduce((sum, row) => sum + (selector(row) * row.nodeCount), 0);
  return weightedSum / totalWeight;
}

export function FleetOverview() {
  const navigate = useNavigate();
  const rollout = useFleetSlice((s) => s.rollout);
  const cohorts = useFleetSlice((s) => s.cohortDistribution);
  const sloCompliance = useFleetSlice((s) => s.sloCompliance);
  const lastUpdatedUtc = useFleetSlice((s) => s.lastUpdatedUtc);
  const liveConnected = useFleetSlice((s) => s.liveConnected);
  const { data: integrityData, error: integrityError } = useActiveConfigIntegrity();
  const wsStatus = useWsConnectionStatus();
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [nodes, setNodes] = useState<NodeSnapshotRow[]>([]);
  const [cohortSummaries, setCohortSummaries] = useState<CohortSummary[]>([]);
  const [auditDecisions, setAuditDecisions] = useState<AuditDecisionRecord[]>([]);
  const [adapterControls, setAdapterControls] = useState<AdapterActivationControlsView | undefined>(undefined);
  const [opsMetrics, setOpsMetrics] = useState<ConsoleOpsMetrics | undefined>(undefined);
  const [changeFeedEvents, setChangeFeedEvents] = useState<ChangeFeedEntry[]>([]);
  const [decisionRateFromMetrics, setDecisionRateFromMetrics] = useState(0);
  const [rbacViolationDelta, setRbacViolationDelta] = useState(0);
  const previousRbacViolationsRef = useRef<number | null>(null);
  const previousAuditQueriesRef = useRef<number | null>(null);
  const previousMetricsTimestampRef = useRef<number | null>(null);
  const previousPolicyVersionsRef = useRef<Map<string, string>>(new Map());
  const previousPolicyThresholdsRef = useRef<Map<string, string>>(new Map());
  const previousRolloutStateRef = useRef<string | undefined>(undefined);
  const previousConfigSeqRef = useRef<number | undefined>(undefined);
  const previousFeatureGateRef = useRef<boolean | undefined>(undefined);
  const rolloutRef = useRef(rollout);

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
          getCohortSummary('1h').catch(() => []),
          fetchAuditDecisions().catch(() => []),
          getAdapterControls().catch(() => undefined)
        ]);
        if (!mounted) return;
        setPolicies(nextPolicies);
        setNodes(nextNodes);
        setCohortSummaries(nextCohorts);
        setAuditDecisions(nextAuditDecisions);
        setAdapterControls(nextAdapterControls);
        setOpsMetrics(nextMetrics);

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
          if (
            previousThresholdSignature
            && nextThresholdSignature
            && previousThresholdSignature !== nextThresholdSignature
          ) {
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
    }, 8000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const fleetStatus = useMemo<StatusIndicatorView>(() => {
    if (!liveConnected || !wsStatus.connected || trustStatus.label === 'Invalid' || sloStatus.label === 'Breach') {
      return {
        label: 'Incident',
        tone: 'critical',
        plainEnglish: 'Are we safe or is something broken?',
        detail: 'One or more critical reliability/trust signals are failing.',
        targetPath: '/alerts'
      };
    }

    if (rolloutStatus.label !== 'Idle' || trustStatus.label === 'Warning') {
      return {
        label: 'Degraded',
        tone: 'warn',
        plainEnglish: 'Are we safe or is something broken?',
        detail: 'System is operating but needs attention before promotion.',
        targetPath: '/cohorts'
      };
    }

    return {
      label: 'Healthy',
      tone: 'ok',
      plainEnglish: 'Are we safe or is something broken?',
      detail: 'No critical fleet-level risks detected.',
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
        detail: `Heartbeat older than ${Math.round(OFFLINE_HEARTBEAT_THRESHOLD_MS / 1000)} seconds.`,
        targetPath: '/machines?offline=1'
      });
    }

    if (signatureInvalidMachinesCount > 0) {
      items.push({
        key: 'signature-invalid',
        severity: 'critical',
        title: `Signature invalid on ${signatureInvalidMachinesCount} machines`,
        detail: 'Trust check failed on one or more machine snapshots.',
        targetPath: '/machines?signature=invalid'
      });
    }

    if (experimentalDegraded) {
      items.push({
        key: 'experimental-degraded',
        severity: 'warn',
        title: "Cohort 'experimental' degraded",
        detail: 'Experimental cohort is underperforming against stable baseline.',
        targetPath: '/cohorts?cohort=experimental&cohortCompare=1&cohortB=stable'
      });
    }

    if (rbacViolationDelta > 0) {
      items.push({
        key: 'rbac-increased',
        severity: 'warn',
        title: 'RBAC violations increased',
        detail: `+${rbacViolationDelta} violations since last refresh.`,
        targetPath: '/security-access?focus=rbac-violations'
      });
    }

    if (rolloutBlockedByCooldown) {
      items.push({
        key: 'rollout-cooldown',
        severity: 'warn',
        title: 'Rollout blocked by cooldown',
        detail: rollout?.cooldownUntilUtc
          ? `Cooldown active until ${formatUtc(rollout.cooldownUntilUtc)}.`
          : 'Rollout is blocked by cooldown state.',
        targetPath: '/rollouts?cooldown=active'
      });
    }

    return items.sort((a, b) => rankSeverity(b.severity) - rankSeverity(a.severity));
  }, [
    experimentalDegraded,
    offlineMachinesCount,
    rbacViolationDelta,
    rollout?.cooldownUntilUtc,
    rolloutBlockedByCooldown,
    signatureInvalidMachinesCount
  ]);

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

  return (
    <div className="grid-three">
      <section className="panel span-all">
        <div className="right-now-header">
          <h3>Right now status bar</h3>
          <p className="muted-line">Is the fleet okay right now, and what should I look at first?</p>
        </div>
        <div className="right-now-grid">
          {[fleetStatus, rolloutStatus, sloStatus, trustStatus].map((item) => (
            <button
              key={item.plainEnglish}
              type="button"
              className={`right-now-card ${item.tone}`}
              onClick={() => navigate(item.targetPath)}
              title={item.detail}
            >
              <span className="right-now-label">{item.plainEnglish}</span>
              <strong className="right-now-value">{item.label}</strong>
              <span className="muted-line">{item.detail}</span>
            </button>
          ))}
        </div>
        <div className="right-now-meta">
          <p>
            Last updated: <strong>{formatUtc(lastUpdatedUtc ?? rollout?.updatedAtUtc)}</strong>
          </p>
          <p>
            Live connection status: <strong>{liveConnected ? 'Connected' : 'Disconnected'}</strong>
          </p>
          <p>
            WS stream: <strong>{wsStatus.statusLabel}</strong> ({wsStatus.detail})
          </p>
        </div>
      </section>

      <section className="panel span-all">
        <div className="panel-heading-row">
          <h3>Needs attention</h3>
          <span className="muted-line">Auto-prioritized triage queue</span>
        </div>
        {needsAttention.length === 0 ? (
          <p className="muted-line">No active issues. Fleet appears stable.</p>
        ) : (
          <div className="needs-attention-list">
            {needsAttention.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`needs-attention-item ${item.severity}`}
                onClick={() => navigate(item.targetPath)}
              >
                <span className="needs-attention-title">{item.title}</span>
                <span className="needs-attention-detail">{item.detail}</span>
              </button>
            ))}
          </div>
        )}
      </section>

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

      <MetricCard
        title="Error rate (fleet)"
        value={`${fleetKpis.errorRatePct.toFixed(3)}%`}
        note="Weighted across cohorts by node count."
        tooltip={{
          meaning: 'Fleet-wide error percentage across all cohorts.',
          whyItMatters: 'It is the fastest signal for production reliability regression.',
          goodLooksLike: 'Low and stable with no sustained spikes.'
        }}
      />
      <MetricCard
        title="P95 latency"
        value={`${Math.round(fleetKpis.latencyP95Ms)} ms`}
        note="Weighted across cohorts by node count."
        tooltip={{
          meaning: '95th percentile response latency across the fleet.',
          whyItMatters: 'Shows tail performance degradation before incidents escalate.',
          goodLooksLike: 'Within SLO target and not trending upward.'
        }}
      />
      <MetricCard
        title="P99 latency"
        value={`${Math.round(fleetKpis.latencyP99Ms)} ms`}
        note="Weighted across cohorts by node count."
        tooltip={{
          meaning: '99th percentile response latency across the fleet.',
          whyItMatters: 'Captures worst-case user experience under load.',
          goodLooksLike: 'Predictable and bounded during experiments/rollouts.'
        }}
      />
      <MetricCard
        title="Degradation %"
        value={`${fleetKpis.degradationPct.toFixed(3)}%`}
        note="Weighted across cohorts by node count."
        tooltip={{
          meaning: 'Overall performance regression rate observed in fleet telemetry.',
          whyItMatters: 'Highlights performance drift even when error rate is stable.',
          goodLooksLike: 'Near zero with short-lived deviations.'
        }}
      />
      <MetricCard
        title="Nodes online/total"
        value={`${fleetKpis.onlineNodes}/${fleetKpis.totalNodes}`}
        note={`Offline threshold: ${Math.round(OFFLINE_HEARTBEAT_THRESHOLD_MS / 1000)}s heartbeat gap.`}
        tooltip={{
          meaning: 'How many machines are currently online versus total tracked machines.',
          whyItMatters: 'Fleet coverage quality determines confidence in all other metrics.',
          goodLooksLike: 'Online count stays near total with minimal churn.'
        }}
      />
      <MetricCard
        title="Policy decisions/min"
        value={fleetKpis.policyDecisionsPerMinute.toFixed(1)}
        note={opsMetrics ? `Audit queries total: ${opsMetrics.audit_queries_total}` : 'No audit metric source available.'}
        tooltip={{
          meaning: 'Estimated policy decision throughput per minute.',
          whyItMatters: 'Shows policy engine activity level and evaluation pressure.',
          goodLooksLike: 'Consistent with expected traffic and rollout state.'
        }}
      />
      <MetricCard
        title="Interventions/min"
        value={fleetKpis.interventionsPerMinute.toFixed(1)}
        note="Computed from recent audit decisions (action=intervene)."
        tooltip={{
          meaning: 'Intervention actions executed per minute.',
          whyItMatters: 'Tracks regulation intensity and catches thrash conditions.',
          goodLooksLike: 'Controlled rate aligned with policy and workload.'
        }}
      />
      <section className="panel span-all">
        <h3>Cohort distribution</h3>
        {cohorts.length === 0 ? (
          <p>No cohort data is available yet.</p>
        ) : (
          <div className="cohort-grid">
            {cohorts.map((cohort) => (
              <button
                className="cohort-item"
                type="button"
                key={cohort.cohortId}
                onClick={() => navigate(`/cohorts?cohort=${encodeURIComponent(cohort.cohortId)}`)}
                title="Open cohort details"
              >
                <strong>{cohort.cohortId}</strong>
                <span>{cohort.exposurePct}% exposure</span>
                <span>Status: {cohort.status}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

