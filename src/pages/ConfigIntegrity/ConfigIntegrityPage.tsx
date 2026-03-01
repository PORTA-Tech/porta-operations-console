import { useEffect, useMemo, useState } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { useActiveConfigIntegrity } from '../../hooks/useActiveConfigIntegrity';
import { useConfigAudit } from '../../hooks/useConfigAudit';
import { useAuditLedgerView } from '../../hooks/useAuditLedgerView';
import { useWsConnectionStatus } from '../../hooks/useWsConnectionStatus';
import { getNodeSnapshot, type NodeSnapshotRow } from '../../api/nodes';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';
import { shortHash } from '../../utils/crypto';
import { toApiError, type ApiError } from '../../api/client';

type ConfigTrustStatus = 'TRUSTED' | 'WARNING' | 'INVALID' | 'INCONCLUSIVE';
type ConfigTab = 'versions' | 'drift' | 'history' | 'verification';

interface TrustVerdict {
  status: ConfigTrustStatus;
  reasonCode: string;
  reasonDetails: Record<string, string | number | boolean | null>;
  summary: string;
}

interface CohortIntegrityRow {
  cohort: string;
  machines: number;
  verified: number;
  invalidSignature: number;
  expired: number;
  drifted: number;
  verifiedPct: number | null;
  configDistribution: Array<{ configSeq: number; count: number }>;
}

interface DriftRecord {
  machineId: string;
  cohort: string;
  expectedConfigSeq: number;
  actualConfigSeq: number;
  driftType: 'SEQ_MISMATCH';
  firstSeen: string;
  lastSeen: string;
  diffSummary: string;
  correlationId: string | null;
}

const MIN_REQUIRED_MACHINES = 20;
const MIN_REQUIRED_COVERAGE_PCT = 70;
const HEARTBEAT_STALE_SECONDS = 60;

const CONFIG_ACTIONS = new Set<string>([
  'config.published',
  'config.promoted',
  'config.rollback',
  'config.revoked',
  'config.signature_failed',
  'config.expired',
  'config.drift_detected',
  'config.verification_failed',
  'config.verification_succeeded'
]);

function toMs(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildTrustVerdict(input: {
  reportingMachines: number;
  verifiedMachines: number;
  verifiedCoveragePct: number;
  freshnessSeconds: number | null;
  wsStreamOk: boolean;
  driftedMachines: number;
  expiredMachines: number;
  signatureValidity: boolean | null;
  issuer: string | null;
  fingerprint: string | null;
}): TrustVerdict {
  if (input.reportingMachines < MIN_REQUIRED_MACHINES) {
    return {
      status: 'INCONCLUSIVE',
      reasonCode: 'INSUFFICIENT_SAMPLE',
      reasonDetails: {
        reporting_machines: input.reportingMachines,
        min_required_machines: MIN_REQUIRED_MACHINES
      },
      summary: `Not enough reporting machines (${input.reportingMachines}/${MIN_REQUIRED_MACHINES}).`
    };
  }

  if (input.verifiedCoveragePct < MIN_REQUIRED_COVERAGE_PCT) {
    return {
      status: 'INCONCLUSIVE',
      reasonCode: 'INSUFFICIENT_COVERAGE',
      reasonDetails: {
        coverage_pct: round(input.verifiedCoveragePct, 1),
        min_required_coverage_pct: MIN_REQUIRED_COVERAGE_PCT
      },
      summary: `Only ${round(input.verifiedCoveragePct, 1)}% machines are verified (min ${MIN_REQUIRED_COVERAGE_PCT}%).`
    };
  }

  if (input.freshnessSeconds === null || input.freshnessSeconds > HEARTBEAT_STALE_SECONDS || !input.wsStreamOk) {
    return {
      status: 'INCONCLUSIVE',
      reasonCode: 'VERIFICATION_PIPELINE_ERROR',
      reasonDetails: {
        freshness_seconds: input.freshnessSeconds,
        stale_threshold_seconds: HEARTBEAT_STALE_SECONDS,
        ws_stream_ok: input.wsStreamOk
      },
      summary: 'Verification freshness is stale or stream health is degraded.'
    };
  }

  if (!input.issuer) {
    return {
      status: 'INCONCLUSIVE',
      reasonCode: 'UNKNOWN_ISSUER',
      reasonDetails: {
        issuer: null
      },
      summary: 'Issuer is unavailable, trust cannot be confirmed.'
    };
  }

  if (!input.fingerprint) {
    return {
      status: 'INCONCLUSIVE',
      reasonCode: 'UNSIGNED_CONFIG',
      reasonDetails: {
        fingerprint: null
      },
      summary: 'Signature fingerprint is unavailable, config is treated as unsigned.'
    };
  }

  if (input.signatureValidity === false) {
    return {
      status: 'INVALID',
      reasonCode: 'SIGNATURE_INVALID',
      reasonDetails: {
        verified_machines: input.verifiedMachines,
        reporting_machines: input.reportingMachines
      },
      summary: 'Config signature validation failed.'
    };
  }

  if (input.expiredMachines > 0) {
    return {
      status: 'INVALID',
      reasonCode: 'CONFIG_EXPIRED',
      reasonDetails: {
        expired_machines: input.expiredMachines
      },
      summary: `${input.expiredMachines} machines report expired config.`
    };
  }

  if (input.driftedMachines > 0) {
    return {
      status: 'WARNING',
      reasonCode: 'DRIFT_DETECTED',
      reasonDetails: {
        drifted_machines: input.driftedMachines
      },
      summary: `${input.driftedMachines} machines are drifting from expected config sequence.`
    };
  }

  return {
    status: 'TRUSTED',
    reasonCode: 'VERIFICATION_SUCCEEDED',
    reasonDetails: {
      verified_machines: input.verifiedMachines,
      reporting_machines: input.reportingMachines
    },
    summary: 'Config signatures and drift checks are healthy.'
  };
}

function toneClass(status: ConfigTrustStatus): 'ok' | 'warn' | 'critical' | 'neutral' {
  if (status === 'TRUSTED') return 'ok';
  if (status === 'WARNING') return 'warn';
  if (status === 'INVALID') return 'critical';
  return 'neutral';
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

export function ConfigIntegrityPage() {
  const active = useActiveConfigIntegrity();
  const configAudit = useConfigAudit();
  const auditLedger = useAuditLedgerView();
  const wsStatus = useWsConnectionStatus();

  const [tab, setTab] = useState<ConfigTab>('versions');
  const [nodes, setNodes] = useState<NodeSnapshotRow[]>([]);
  const [nodesLoading, setNodesLoading] = useState(true);
  const [nodesError, setNodesError] = useState<ApiError | undefined>();
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    const refreshNodes = async (): Promise<void> => {
      try {
        const snapshot = await getNodeSnapshot();
        if (!mounted) return;
        setNodes(snapshot);
        setNodesError(undefined);
      } catch (err) {
        if (!mounted) return;
        setNodesError(toApiError(err));
      } finally {
        if (mounted) setNodesLoading(false);
      }
    };

    void refreshNodes();
    const timer = window.setInterval(() => {
      void refreshNodes();
    }, 5_000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const nowMs = Date.now();
  const expectedConfigSeq = active.data?.config_seq ?? null;
  const expiresAtMs = toMs(active.data?.expires_at_utc);
  const latestHeartbeatMs = useMemo(() => {
    const values = nodes
      .map((node) => toMs(node.last_heartbeat))
      .filter((value): value is number => value !== null)
      .sort((a, b) => b - a);
    return values[0] ?? null;
  }, [nodes]);
  const freshnessSeconds = latestHeartbeatMs === null ? null : Math.max(0, Math.floor((nowMs - latestHeartbeatMs) / 1000));
  const reportingMachines = nodes.filter((node) => {
    const heartbeatMs = toMs(node.last_heartbeat);
    if (heartbeatMs === null) return false;
    return nowMs - heartbeatMs <= HEARTBEAT_STALE_SECONDS * 1000;
  }).length;
  const verifiedMachines = nodes.filter((node) => node.signature_valid).length;
  const invalidSignatureMachines = nodes.filter((node) => !node.signature_valid).length;
  const driftedNodes = expectedConfigSeq === null
    ? []
    : nodes.filter((node) => node.config_seq !== expectedConfigSeq);
  const driftedMachines = driftedNodes.length;
  const expiredMachines = expiresAtMs !== null && expiresAtMs <= nowMs ? reportingMachines : 0;
  const verifiedCoveragePct = reportingMachines > 0 ? (verifiedMachines / reportingMachines) * 100 : 0;
  const fleetCoveragePct = nodes.length > 0 ? (verifiedMachines / nodes.length) * 100 : 0;
  const wsStreamOk = wsStatus.statusLabel === 'Connected';

  const verdict = useMemo(
    () =>
      buildTrustVerdict({
        reportingMachines,
        verifiedMachines,
        verifiedCoveragePct,
        freshnessSeconds,
        wsStreamOk,
        driftedMachines,
        expiredMachines,
        signatureValidity: typeof active.data?.signature_validity === 'boolean' ? active.data.signature_validity : null,
        issuer: active.data?.issuer ?? null,
        fingerprint: active.data?.hash_fingerprint ?? null
      }),
    [
      reportingMachines,
      verifiedMachines,
      verifiedCoveragePct,
      freshnessSeconds,
      wsStreamOk,
      driftedMachines,
      expiredMachines,
      active.data?.signature_validity,
      active.data?.issuer,
      active.data?.hash_fingerprint
    ]
  );

  const cohortRows = useMemo((): CohortIntegrityRow[] => {
    const byCohort = new Map<string, NodeSnapshotRow[]>();
    for (const node of nodes) {
      const bucket = byCohort.get(node.cohort) ?? [];
      bucket.push(node);
      byCohort.set(node.cohort, bucket);
    }
    return [...byCohort.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([cohort, cohortNodes]) => {
        const machines = cohortNodes.length;
        const verified = cohortNodes.filter((node) => node.signature_valid).length;
        const invalidSignature = machines - verified;
        const drifted = expectedConfigSeq === null ? 0 : cohortNodes.filter((node) => node.config_seq !== expectedConfigSeq).length;
        const expired = expiresAtMs !== null && expiresAtMs <= nowMs ? machines : 0;
        const byConfig = new Map<number, number>();
        for (const node of cohortNodes) {
          byConfig.set(node.config_seq, (byConfig.get(node.config_seq) ?? 0) + 1);
        }
        const configDistribution = [...byConfig.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([configSeq, count]) => ({ configSeq, count }));
        return {
          cohort,
          machines,
          verified,
          invalidSignature,
          expired,
          drifted,
          verifiedPct: machines > 0 ? round((verified / machines) * 100, 1) : null,
          configDistribution
        };
      });
  }, [nodes, expectedConfigSeq, expiresAtMs, nowMs]);

  const driftRecords = useMemo((): DriftRecord[] => {
    if (expectedConfigSeq === null) return [];
    const byCohortCorrelation = new Map<string, string>();
    for (const row of auditLedger.rows) {
      if (row.action === 'config.drift_detected') {
        byCohortCorrelation.set(row.cohort, row.correlation_id);
      }
    }
    return driftedNodes.map((node) => ({
      machineId: node.node_id,
      cohort: node.cohort,
      expectedConfigSeq,
      actualConfigSeq: node.config_seq,
      driftType: 'SEQ_MISMATCH',
      firstSeen: node.last_heartbeat,
      lastSeen: node.last_heartbeat,
      diffSummary: `Machine is on config_seq ${node.config_seq}; expected ${expectedConfigSeq}.`,
      correlationId: byCohortCorrelation.get(node.cohort) ?? null
    }));
  }, [expectedConfigSeq, driftedNodes, auditLedger.rows]);

  const configVersions = useMemo(() => {
    const rows = [...configAudit.rows].sort((left, right) => right.configSeq - left.configSeq);
    const distribution = new Map<number, number>();
    for (const node of nodes) {
      distribution.set(node.config_seq, (distribution.get(node.config_seq) ?? 0) + 1);
    }
    return { rows, distribution };
  }, [configAudit.rows, nodes]);

  const changeHistoryRows = useMemo(() => {
    return auditLedger.rows.filter((row) => CONFIG_ACTIONS.has(row.action));
  }, [auditLedger.rows]);

  const verificationLogs = useMemo(() => {
    return nodes
      .map((node) => {
        const expired = expiresAtMs !== null && expiresAtMs <= nowMs;
        const result = node.signature_valid && !expired ? 'succeeded' : 'failed';
        const reasonCode = node.signature_valid
          ? expired ? 'CONFIG_EXPIRED' : null
          : 'SIGNATURE_INVALID';
        return {
          machineId: node.node_id,
          timestamp: node.last_heartbeat,
          result,
          reasonCode,
          latency: null as number | null,
          signerKeyId: active.data?.issuer ?? null
        };
      })
      .sort((left, right) => (toMs(right.timestamp) ?? 0) - (toMs(left.timestamp) ?? 0));
  }, [nodes, expiresAtMs, nowMs, active.data?.issuer]);

  const exportDriftReport = () => {
    if (driftRecords.length === 0) {
      setActionMessage('No drift records to export.');
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadJson(`config-drift-report-${stamp}.json`, {
      generated_at_utc: new Date().toISOString(),
      expected_config_seq: expectedConfigSeq,
      drift_records: driftRecords
    });
    setActionMessage(`Drift report exported (${driftRecords.length} records).`);
  };

  const exportSnapshot = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadJson(`config-integrity-snapshot-${stamp}.json`, {
      evaluated_at_utc: new Date().toISOString(),
      fleet_totals: {
        total_machines: nodes.length,
        reporting_machines: reportingMachines,
        verified_machines: verifiedMachines,
        invalid_signature_machines: invalidSignatureMachines,
        expired_machines: expiredMachines,
        drifted_machines: driftedMachines
      },
      data_quality: {
        coverage_pct: round(verifiedCoveragePct, 1),
        freshness_seconds: freshnessSeconds,
        ws_stream_ok: wsStreamOk,
        min_required_machines: MIN_REQUIRED_MACHINES,
        min_required_coverage_pct: MIN_REQUIRED_COVERAGE_PCT
      },
      trust_verdict: {
        status: verdict.status,
        reason_code: verdict.reasonCode,
        reason_details: verdict.reasonDetails
      },
      active_config: active.data ?? null,
      cohort_breakdown: cohortRows,
      drift_records: driftRecords
    });
    setActionMessage('Config integrity snapshot exported.');
  };

  const copyFingerprint = async () => {
    const fingerprint = active.data?.hash_fingerprint;
    if (!fingerprint) {
      setActionMessage('Fingerprint is unavailable.');
      return;
    }
    try {
      await navigator.clipboard.writeText(fingerprint);
      setActionMessage('Fingerprint copied.');
    } catch {
      setActionMessage('Clipboard unavailable. Fingerprint could not be copied.');
    }
  };

  return (
    <div className="stack">
      <Panel title="Config Trust Status">
        {active.loading || nodesLoading ? <p className="muted-line">Loading config integrity snapshot...</p> : null}
        {active.error ? <p className="error-line">{active.error.code}: {active.error.message}</p> : null}
        {nodesError ? <p className="error-line">{nodesError.code}: {nodesError.message}</p> : null}
        {actionMessage ? <p className="muted-line">{actionMessage}</p> : null}
        <p className="muted-line">
          {wsStatus.statusLabel === 'Connected'
            ? 'Realtime mode active.'
            : `Polling mode (${wsStatus.statusLabel.toLowerCase()}). Last stream change: ${formatRelativeFromNow(wsStatus.lastChangedUtc)}.`}
        </p>
        <div className="config-top-grid">
          <div className={`config-indicator-card ${toneClass(verdict.status)}`}>
            <p className="status-card-title">Config Trust</p>
            <p className="right-now-value">{verdict.status}</p>
            <p>{verdict.summary}</p>
          </div>
          <div className="config-indicator-card">
            <p className="status-card-title">Fleet Coverage</p>
            <p className="right-now-value">{round(fleetCoveragePct, 1)}%</p>
            <p>{verifiedMachines} / {nodes.length} machines verified</p>
          </div>
          <div className={`config-indicator-card ${driftedMachines > 0 ? 'warn' : 'ok'}`}>
            <p className="status-card-title">Drift</p>
            <p className="right-now-value">{driftedMachines > 0 ? 'Detected' : 'None'}</p>
            <p>{driftedMachines} machines drifting</p>
          </div>
          <div className={`config-indicator-card ${freshnessSeconds !== null && freshnessSeconds <= HEARTBEAT_STALE_SECONDS ? 'ok' : 'warn'}`}>
            <p className="status-card-title">Freshness</p>
            <p className="right-now-value">{freshnessSeconds === null ? 'Stale' : `${freshnessSeconds}s`}</p>
            <p>Last updated: {formatUtc(latestHeartbeatMs === null ? undefined : new Date(latestHeartbeatMs).toISOString())}</p>
          </div>
        </div>
        <details className="rollout-detail-box">
          <summary>Details</summary>
          <div className="rollout-detail-content">
            <p>reason_code: {verdict.reasonCode}</p>
            <p>reason_details: {JSON.stringify(verdict.reasonDetails)}</p>
          </div>
        </details>
      </Panel>

      <Panel title="Fleet Integrity Summary">
        <div className="table-scroll-wrap">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Cohort</th>
                <th>Machines</th>
                <th>Verified %</th>
                <th>Invalid signature</th>
                <th>Expired</th>
                <th>Drifted</th>
                <th>Top config versions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cohortRows.map((row) => (
                <tr key={row.cohort}>
                  <td>{row.cohort}</td>
                  <td>{row.machines}</td>
                  <td>{row.verifiedPct === null ? 'Unavailable' : `${row.verifiedPct.toFixed(1)}%`}</td>
                  <td>{row.invalidSignature}</td>
                  <td>{row.expired}</td>
                  <td>{row.drifted}</td>
                  <td>
                    {row.configDistribution.slice(0, 3).map((entry) => `seq ${entry.configSeq} (${entry.count})`).join(', ') || 'Unavailable'}
                  </td>
                  <td>
                    <div className="button-row">
                      <a className="inline-button-link" href={`/machines?cohort=${encodeURIComponent(row.cohort)}&signatureInvalid=1`}>
                        Open invalid
                      </a>
                      <a className="inline-button-link" href={`/machines?cohort=${encodeURIComponent(row.cohort)}&configDrift=1`}>
                        Open drifted
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {cohortRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted-line">No cohort integrity data available.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Detailed Drilldowns">
        <div className="machine-drilldown-tabs">
          <button type="button" className={tab === 'versions' ? 'active' : undefined} onClick={() => setTab('versions')}>
            Config Versions
          </button>
          <button type="button" className={tab === 'drift' ? 'active' : undefined} onClick={() => setTab('drift')}>
            Drift and Diffs
          </button>
          <button type="button" className={tab === 'history' ? 'active' : undefined} onClick={() => setTab('history')}>
            Change History
          </button>
          <button type="button" className={tab === 'verification' ? 'active' : undefined} onClick={() => setTab('verification')}>
            Verification Logs
          </button>
        </div>

        {tab === 'versions' ? (
          <div className="stack">
            <div className="button-row">
              <button type="button" onClick={exportSnapshot}>Export snapshot JSON</button>
            </div>
            <div className="config-active-card">
              <p><strong>Active config:</strong> {active.data?.config_seq ?? 'Unavailable'} ({active.data?.config_version ?? 'Unavailable'})</p>
              <p><strong>Issuer:</strong> {active.data?.issuer || 'Unavailable'}</p>
              <p><strong>Signature:</strong> {active.data ? (active.data.signature_validity ? 'Verified' : 'Failed') : 'Unavailable'}</p>
              <p><strong>Expiry:</strong> {active.data?.expires_at_utc ? `${formatUtc(active.data.expires_at_utc)} (${formatRelativeFromNow(active.data.expires_at_utc)})` : 'Unavailable'}</p>
              <p>
                <strong>Fingerprint:</strong> {active.data?.hash_fingerprint ? shortHash(active.data.hash_fingerprint) : 'Unavailable'}
                {' '}
                <button type="button" onClick={() => void copyFingerprint()}>Copy</button>
              </p>
            </div>
            <div className="table-scroll-wrap">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Config seq</th>
                    <th>Version</th>
                    <th>Issuer</th>
                    <th>Applied</th>
                    <th>Rollout status</th>
                    <th>Hash</th>
                    <th>Machines on seq</th>
                  </tr>
                </thead>
                <tbody>
                  {configVersions.rows.map((row) => (
                    <tr key={`${row.configSeq}-${row.appliedAtUtc}`}>
                      <td>{row.configSeq}</td>
                      <td>{row.configVersion}</td>
                      <td>{row.issuerId}</td>
                      <td>{formatUtc(row.appliedAtUtc)}</td>
                      <td>{row.rolloutStatus}</td>
                      <td>{shortHash(row.hash) || 'Unavailable'}</td>
                      <td>{configVersions.distribution.get(row.configSeq) ?? 0}</td>
                    </tr>
                  ))}
                  {configVersions.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted-line">No config versions available.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === 'drift' ? (
          <div className="stack">
            <div className="button-row">
              <button type="button" onClick={exportDriftReport}>Export drift report</button>
            </div>
            <div className="table-scroll-wrap">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Machine ID</th>
                    <th>Cohort</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Drift type</th>
                    <th>First seen</th>
                    <th>Last seen</th>
                    <th>Diff summary</th>
                    <th>Correlation</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {driftRecords.map((record) => (
                    <tr key={record.machineId}>
                      <td>{record.machineId}</td>
                      <td>{record.cohort}</td>
                      <td>{record.expectedConfigSeq}</td>
                      <td>{record.actualConfigSeq}</td>
                      <td>{record.driftType}</td>
                      <td>{formatUtc(record.firstSeen)}</td>
                      <td>{formatUtc(record.lastSeen)}</td>
                      <td>{record.diffSummary}</td>
                      <td>{record.correlationId ?? 'Unavailable'}</td>
                      <td>
                        {record.correlationId ? (
                          <a className="inline-button-link" href={`/audit-traces?correlation=${encodeURIComponent(record.correlationId)}`}>
                            Open trace
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActionMessage('No correlation id is available for this drift record.')}
                          >
                            Open trace
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {driftRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="muted-line">No drift records detected.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === 'history' ? (
          <div className="table-scroll-wrap">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Timestamp</th>
                  <th>Cohort</th>
                  <th>Previous config</th>
                  <th>Resulting config</th>
                  <th>Correlation</th>
                </tr>
              </thead>
              <tbody>
                {changeHistoryRows.map((row, index) => (
                  <tr key={`${row.timestamp}-${row.correlation_id}-${index}`}>
                    <td>{row.action}</td>
                    <td>{row.actor}</td>
                    <td>{formatUtc(row.timestamp)}</td>
                    <td>{row.cohort || 'Unavailable'}</td>
                    <td>{row.previous_state || 'Unavailable'}</td>
                    <td>{row.resulting_state || 'Unavailable'}</td>
                    <td>{row.correlation_id || 'Unavailable'}</td>
                  </tr>
                ))}
                {changeHistoryRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted-line">No config integrity change events found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'verification' ? (
          <div className="table-scroll-wrap">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Machine ID</th>
                  <th>Timestamp</th>
                  <th>Result</th>
                  <th>Reason code</th>
                  <th>Latency</th>
                  <th>Signer key id</th>
                </tr>
              </thead>
              <tbody>
                {verificationLogs.map((row) => (
                  <tr key={row.machineId}>
                    <td>{row.machineId}</td>
                    <td>{formatUtc(row.timestamp)}</td>
                    <td>{row.result}</td>
                    <td>{row.reasonCode ?? 'Unavailable'}</td>
                    <td>{row.latency ?? 'Unavailable'}</td>
                    <td>{row.signerKeyId ?? 'Unavailable'}</td>
                  </tr>
                ))}
                {verificationLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted-line">No verification logs available.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      {(configAudit.loading || auditLedger.loading) ? (
        <p className="muted-line">Refreshing integrity history...</p>
      ) : null}
      {configAudit.error ? <p className="error-line">{configAudit.error.code}: {configAudit.error.message}</p> : null}
      {auditLedger.error ? <p className="error-line">{auditLedger.error.code}: {auditLedger.error.message}</p> : null}
    </div>
  );
}
