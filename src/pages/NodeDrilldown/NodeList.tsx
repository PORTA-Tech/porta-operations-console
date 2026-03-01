import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { useWsConnectionStatus } from '../../hooks/useWsConnectionStatus';
import type { ApiError } from '../../api/client';
import type { MachineDataMode, NodeDetail } from '../../types/ui';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

interface NodeListProps {
  nodes: NodeDetail[];
  loading: boolean;
  error: ApiError | undefined;
  lastUpdatedUtc: string | undefined;
  snapshotConnected: boolean;
  tableFrozen: boolean;
  environmentLabel: 'Local' | 'Staging' | 'Prod';
  allowDemoMode: boolean;
  demoModeOn: boolean;
  setDemoModeOn: (enabled: boolean) => void;
  simulatedSnapshotDetected: boolean;
  dataMode: MachineDataMode;
  highOverloadThreshold: number;
  highInterventionRateThreshold: number;
}

type MachineScope = 'active' | 'recent_issues' | 'all_known';

function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'unknown';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function parseMachineScope(value: string | null): MachineScope {
  if (value === 'recent_issues') return 'recent_issues';
  if (value === 'all_known') return 'all_known';
  return 'active';
}

function formatIssueReason(reason: string): string {
  if (reason === 'SIGNATURE_INVALID') return 'signature invalid';
  if (reason === 'CONFIG_DRIFT') return 'config drift';
  if (reason === 'AGENT_OFFLINE') return 'agent offline';
  return reason.toLowerCase();
}

function formatStateValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(2);
}

function formatErrorDegradation(node: NodeDetail): string {
  if (node.errorRatePct === null) {
    return 'No perf data yet';
  }
  const errorPart = `error ${(node.errorRatePct).toFixed(3)}%`;
  return `${errorPart} / ${node.degradationTag}`;
}

function formatTrustLabel(status: NodeDetail['signatureStatus']): 'Signed' | 'Invalid' | 'Unknown' {
  if (status === 'verified') return 'Signed';
  if (status === 'invalid') return 'Invalid';
  return 'Unknown';
}

function formatTrustLower(status: NodeDetail['signatureStatus']): 'signed' | 'invalid' | 'unknown' {
  if (status === 'verified') return 'signed';
  if (status === 'invalid') return 'invalid';
  return 'unknown';
}

function formatControlPlaneLabel(connected: boolean): 'Online' | 'Offline' {
  return connected ? 'Online' : 'Offline';
}

function formatConfidenceBand(confidence: number | null): string {
  if (confidence === null || !Number.isFinite(confidence)) return 'n/a';
  const bounded = Math.min(1, Math.max(0, confidence));
  const sigma = Math.max(0.01, (1 - bounded) * 0.2);
  return `±${sigma.toFixed(2)}`;
}

function formatStateChip(node: NodeDetail): string {
  if (node.stateSummary.focus === null && node.stateSummary.overload === null && node.stateSummary.fatigue === null) {
    return 'No state yet';
  }
  return `Focus ${formatStateValue(node.stateSummary.focus)} (${formatConfidenceBand(node.stateSummary.confidence)}) | Overload ${formatStateValue(node.stateSummary.overload)} | Fatigue ${formatStateValue(node.stateSummary.fatigue)}`;
}

function formatStateChipTooltip(node: NodeDetail): string {
  const confidence = node.stateSummary.confidence === null || !Number.isFinite(node.stateSummary.confidence)
    ? 'n/a'
    : node.stateSummary.confidence.toFixed(2);
  const contributors = node.stateSummary.contributors.length > 0
    ? node.stateSummary.contributors.join(', ')
    : 'none captured';
  return `Confidence: ${confidence}\nContributors: ${contributors}\nSource: ${node.stateSummary.source}\nUpdated: ${formatUtc(node.stateSummary.lastUpdatedUtc ?? undefined)}`;
}

function sortRecentEvents(node: NodeDetail): NodeDetail['recentEvents'] {
  return [...node.recentEvents].sort((a, b) => Date.parse(b.timestampUtc) - Date.parse(a.timestampUtc));
}

function formatLastPolicyDecision(node: NodeDetail): string {
  const latest = sortRecentEvents(node)[0];
  if (!latest) return 'n/a';
  return `${latest.decision} (${latest.policyId})`;
}

function formatLastErrorSignal(node: NodeDetail): string {
  if (node.signatureStatus === 'invalid') return 'signature invalid';
  if (node.degradationTag === 'critical') return 'critical degradation';
  if (node.errorRatePct !== null && node.errorRatePct > 0) return `error rate ${node.errorRatePct.toFixed(3)}%`;
  return 'no error captured';
}

function formatWhyHere(node: NodeDetail): string {
  if (node.demo) {
    return 'Demo seed row. This machine is synthetic and only exists for simulator coverage/testing.';
  }
  if (node.sourceKind === 'recent_issue') {
    const summary = node.issueSummary ?? 'recent machine issue';
    return `This machine is shown from recent issue history (${summary}) at ${formatUtc(node.lastIssueAtUtc ?? undefined)}.`;
  }
  if (node.issueSummary) {
    return `This machine is active and also has recent issues: ${node.issueSummary}.`;
  }
  return `Registered via heartbeat at ${formatUtc(node.lastHeartbeatUtc)}.`;
}

function dataSourceLabel(dataMode: MachineDataMode): string {
  if (dataMode === 'live_stream') return 'Live stream + snapshot';
  if (dataMode === 'demo') return 'Demo fixtures';
  return 'Snapshot poll';
}

function dataModeLabel(dataMode: MachineDataMode): 'Live' | 'Demo' {
  return dataMode === 'demo' ? 'Demo' : 'Live';
}

export function NodeList({
  nodes,
  loading,
  error,
  lastUpdatedUtc,
  snapshotConnected,
  tableFrozen,
  environmentLabel,
  allowDemoMode,
  demoModeOn,
  setDemoModeOn,
  simulatedSnapshotDetected,
  dataMode,
  highOverloadThreshold,
  highInterventionRateThreshold
}: NodeListProps) {
  const navigate = useNavigate();
  const wsStatus = useWsConnectionStatus();
  const [params, setParams] = useSearchParams();
  const [scope, setScope] = useState<MachineScope>(parseMachineScope(params.get('scope')));
  const [showSyntheticIssues, setShowSyntheticIssues] = useState(params.get('showSyntheticIssues') === '1');
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [cohortFilter, setCohortFilter] = useState(params.get('cohort') ?? 'all');
  const [offlineOnly, setOfflineOnly] = useState(params.get('offline') === '1');
  const [signatureInvalidOnly, setSignatureInvalidOnly] = useState(
    params.get('signatureInvalid') === '1' || params.get('signature') === 'invalid'
  );
  const [configDriftOnly, setConfigDriftOnly] = useState(params.get('configDrift') === '1');
  const [versionMismatchOnly, setVersionMismatchOnly] = useState(params.get('versionMismatch') === '1');
  const [highOverloadOnly, setHighOverloadOnly] = useState(params.get('highOverload') === '1');
  const [highInterventionOnly, setHighInterventionOnly] = useState(params.get('highIntervention') === '1');
  const [openPeekNodeId, setOpenPeekNodeId] = useState('');
  const [openWhyNodeId, setOpenWhyNodeId] = useState('');
  const selectedMachineId = params.get('machine') ?? '';

  useEffect(() => {
    setScope(parseMachineScope(params.get('scope')));
    setShowSyntheticIssues(params.get('showSyntheticIssues') === '1');
    setSearch(params.get('search') ?? '');
    setCohortFilter(params.get('cohort') ?? 'all');
    setOfflineOnly(params.get('offline') === '1');
    setSignatureInvalidOnly(params.get('signatureInvalid') === '1' || params.get('signature') === 'invalid');
    setConfigDriftOnly(params.get('configDrift') === '1');
    setVersionMismatchOnly(params.get('versionMismatch') === '1');
    setHighOverloadOnly(params.get('highOverload') === '1');
    setHighInterventionOnly(params.get('highIntervention') === '1');
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

  const activeSnapshotNodes = useMemo(
    () => nodes.filter((node) => node.sourceKind === 'snapshot' && (!node.demo || demoModeOn)),
    [nodes, demoModeOn]
  );

  const recentIssueNodes = useMemo(
    () => nodes.filter((node) => node.issueReasonCodes.length > 0 || node.sourceKind === 'recent_issue'),
    [nodes]
  );

  const hiddenSyntheticIssueNodes = useMemo(
    () => recentIssueNodes.filter((node) => node.demo && !demoModeOn),
    [recentIssueNodes, demoModeOn]
  );

  const scopedNodes = useMemo(() => {
    let base: NodeDetail[];
    if (scope === 'recent_issues') {
      base = recentIssueNodes;
    } else if (scope === 'all_known') {
      base = nodes;
    } else {
      base = activeSnapshotNodes;
    }
    return base.filter((node) => {
      if (!node.demo) return true;
      if (demoModeOn) return true;
      if (scope === 'recent_issues' && showSyntheticIssues && node.issueReasonCodes.length > 0) return true;
      return false;
    });
  }, [scope, recentIssueNodes, nodes, activeSnapshotNodes, demoModeOn, showSyntheticIssues]);

  const cohorts = useMemo(() => Array.from(new Set(scopedNodes.map((node) => node.cohortId))), [scopedNodes]);

  const filteredNodes = useMemo(() => {
    const query = search.trim().toLowerCase();

    return scopedNodes.filter((node) => {
      const matchesSearch =
        query.length === 0
        || [
          node.nodeId,
          node.cohortId,
          node.agentVersion,
          String(node.configSeq),
          node.signatureStatus,
          formatUtc(node.lastHeartbeatUtc),
          node.lastIntervention,
          formatErrorDegradation(node)
        ].some((value) => value.toLowerCase().includes(query));
      if (!matchesSearch) return false;
      if (cohortFilter !== 'all' && node.cohortId !== cohortFilter) return false;
      if (offlineOnly && !node.offline) return false;
      if (signatureInvalidOnly && node.signatureStatus !== 'invalid') return false;
      if (configDriftOnly && !node.configDrift) return false;
      if (versionMismatchOnly && !node.versionMismatch) return false;
      if (highOverloadOnly && ((node.stateSummary.overload ?? -1) < highOverloadThreshold)) return false;
      if (highInterventionOnly && node.interventionRate15m < highInterventionRateThreshold) return false;
      return true;
    });
  }, [
    scopedNodes,
    search,
    cohortFilter,
    offlineOnly,
    signatureInvalidOnly,
    configDriftOnly,
    versionMismatchOnly,
    highOverloadOnly,
    highInterventionOnly,
    highOverloadThreshold,
    highInterventionRateThreshold
  ]);

  const counts = useMemo(() => {
    const total = scopedNodes.length;
    const online = scopedNodes.filter((node) => !node.offline).length;
    const offline = total - online;
    const demo = scopedNodes.filter((node) => node.demo).length;
    return { total, online, offline, demo };
  }, [scopedNodes]);
  const noCacheWhileDisconnected = !snapshotConnected && activeSnapshotNodes.length === 0;
  const environmentDisplayLabel = dataMode === 'demo' ? 'Local / Demo' : environmentLabel;

  return (
    <Panel title="Machines truth table">
      {loading ? <p className="muted-line">Loading machine snapshot...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      <div className="machines-data-banner">
        <div>
          <strong>Environment:</strong> {environmentDisplayLabel}
        </div>
        <div>
          <strong>Data mode:</strong> {dataModeLabel(dataMode)}
        </div>
        <div>
          <strong>Data source:</strong> {dataSourceLabel(dataMode)}
        </div>
        <div>
          <strong>Connection:</strong> {snapshotConnected ? 'Connected' : 'Disconnected'}
        </div>
        <div>
          <strong>Source channel:</strong> {dataMode === 'live_stream' ? 'Websocket Stream' : 'Snapshot Poll'}
        </div>
        <div>
          <strong>Realtime Channel:</strong> {wsStatus.statusLabel}
        </div>
        <div>
          <strong>Last updated:</strong> {formatRelativeFromNow(lastUpdatedUtc)} ({formatUtc(lastUpdatedUtc)})
        </div>
        <div>
          <strong>Counts:</strong> Total {counts.total} | Online {counts.online} | Offline {counts.offline} | Demo {counts.demo}
        </div>
        <div>
          <strong>Scope:</strong> {scope === 'active' ? 'Active machines' : scope === 'recent_issues' ? 'Recent issues (24h)' : 'All known'}
        </div>
        {allowDemoMode ? (
          <label className="machines-demo-toggle">
            <strong>Demo Mode</strong>
            <input
              type="checkbox"
              checked={demoModeOn}
              onChange={(event) => setDemoModeOn(event.target.checked)}
            />
          </label>
        ) : (
          <div>
            <strong>Demo Mode:</strong> Disabled in Prod
          </div>
        )}
      </div>
      {tableFrozen ? (
        <p className="focus-banner">
          Connection is disconnected. Table is frozen at last successful snapshot ({formatUtc(lastUpdatedUtc)}).
        </p>
      ) : null}
      {noCacheWhileDisconnected ? (
        <p className="focus-banner">
          Connection is disconnected and no cached snapshot is available. Machines table is intentionally empty until live data returns.
        </p>
      ) : null}
      {scope === 'active' && activeSnapshotNodes.length === 0 && recentIssueNodes.length > 0 ? (
        <p className="focus-banner">
          No active machines are reporting, but {recentIssueNodes.length} machine issue{recentIssueNodes.length === 1 ? '' : 's'} were seen in the last 24h.
          {' '}
          <button
            type="button"
            onClick={() => {
              setScope('recent_issues');
              updateParam('scope', 'recent_issues', 'active');
            }}
          >
            View recent issues
          </button>
        </p>
      ) : null}
      {simulatedSnapshotDetected && !demoModeOn ? (
        <p className="focus-banner">
          Simulated snapshot rows detected and hidden by default. Enable Demo Mode to inspect synthetic fleet data.
        </p>
      ) : null}
      {scope === 'recent_issues' && hiddenSyntheticIssueNodes.length > 0 && !showSyntheticIssues ? (
        <p className="focus-banner">
          {hiddenSyntheticIssueNodes.length} recent issue row{hiddenSyntheticIssueNodes.length === 1 ? '' : 's'} are synthetic and hidden.
          {' '}
          <button
            type="button"
            onClick={() => {
              setShowSyntheticIssues(true);
              updateParam('showSyntheticIssues', '1');
            }}
          >
            Show synthetic issue rows
          </button>
        </p>
      ) : null}
      {dataMode === 'demo' || (counts.demo > 0 && demoModeOn) ? (
        <p className="focus-banner">
          Demo data mode is ON. Machines list may include synthetic rows.
        </p>
      ) : null}

      <div className="table-controls">
        <select
          value={scope}
          onChange={(event) => {
            const next = parseMachineScope(event.target.value);
            setScope(next);
            updateParam('scope', next, 'active');
          }}
          aria-label="Machine scope"
        >
          <option value="active">Active machines</option>
          <option value="recent_issues">Machines with recent issues (24h)</option>
          <option value="all_known">All known machines</option>
        </select>
        <input
          className="table-search-input"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            updateParam('search', event.target.value);
          }}
          placeholder="Search machine id, version, trust, intervention..."
          aria-label="Search machine rows"
        />
        <select
          value={cohortFilter}
          onChange={(event) => {
            setCohortFilter(event.target.value);
            updateParam('cohort', event.target.value, 'all');
          }}
          aria-label="Filter by cohort"
        >
          <option value="all">All cohorts</option>
          {cohorts.map((cohort) => (
            <option key={cohort} value={cohort}>
              {cohort}
            </option>
          ))}
        </select>
        <label>
          Include synthetic issue rows
          <input
            type="checkbox"
            checked={showSyntheticIssues}
            disabled={scope !== 'recent_issues'}
            onChange={(event) => {
              const enabled = event.target.checked;
              setShowSyntheticIssues(enabled);
              updateParam('showSyntheticIssues', enabled ? '1' : '', '');
            }}
          />
        </label>
        <label>
          Offline/stale
          <input
            type="checkbox"
            checked={offlineOnly}
            onChange={(event) => {
              setOfflineOnly(event.target.checked);
              updateParam('offline', event.target.checked ? '1' : '', '');
            }}
          />
        </label>
        <label>
          Signature invalid
          <input
            type="checkbox"
            checked={signatureInvalidOnly}
            onChange={(event) => {
              const enabled = event.target.checked;
              setSignatureInvalidOnly(enabled);
              const next = new URLSearchParams(params);
              if (enabled) {
                next.set('signatureInvalid', '1');
                next.set('signature', 'invalid');
              } else {
                next.delete('signatureInvalid');
                next.delete('signature');
              }
              setParams(next, { replace: true });
            }}
          />
        </label>
        <label>
          Config drift
          <input
            type="checkbox"
            checked={configDriftOnly}
            onChange={(event) => {
              setConfigDriftOnly(event.target.checked);
              updateParam('configDrift', event.target.checked ? '1' : '', '');
            }}
          />
        </label>
        <label>
          Version mismatch
          <input
            type="checkbox"
            checked={versionMismatchOnly}
            onChange={(event) => {
              setVersionMismatchOnly(event.target.checked);
              updateParam('versionMismatch', event.target.checked ? '1' : '', '');
            }}
          />
        </label>
        <label>
          High overload
          <input
            type="checkbox"
            checked={highOverloadOnly}
            onChange={(event) => {
              setHighOverloadOnly(event.target.checked);
              updateParam('highOverload', event.target.checked ? '1' : '', '');
            }}
          />
        </label>
        <label>
          High intervention rate
          <input
            type="checkbox"
            checked={highInterventionOnly}
            onChange={(event) => {
              setHighInterventionOnly(event.target.checked);
              updateParam('highIntervention', event.target.checked ? '1' : '', '');
            }}
          />
        </label>
      </div>

      <div className={dataMode === 'demo' ? 'demo-watermark-surface' : undefined}>
      <table className="simple-table machine-table">
        <thead>
          <tr>
            <th>Machine ID</th>
            <th>Cohort</th>
            <th>Last heartbeat (age)</th>
            <th>Agent version</th>
            <th title="Config sequence currently active on this machine.">Config</th>
            <th title="Signed means this agent's config + identity is cryptographically verifiable.">Trust</th>
            <th title="Live status of machine connectivity to the control-plane.">Control-plane</th>
            <th title="Compact state snapshot with confidence. Hover for contributors and source details.">State</th>
            <th>Last intervention</th>
            <th>Error rate / degradation tag</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredNodes.map((node) => {
            const recentEvents = sortRecentEvents(node).slice(0, 10);
            const peekOpen = openPeekNodeId === node.nodeId;
            const whyOpen = openWhyNodeId === node.nodeId;
            const simulated = node.demo || dataMode === 'demo';

            return (
              <Fragment key={node.nodeId}>
                <tr
                  className={`click-row ${selectedMachineId === node.nodeId ? 'machine-selected-row' : ''} ${simulated ? 'machine-simulated-row' : ''}`}
                  onClick={() => {
                    updateParam('machine', node.nodeId);
                  }}
                  title="Select machine for drilldown"
                >
                  <td>
                    {node.nodeId}
                    {node.sourceKind === 'recent_issue' ? <span className="delta-chip warn">recent issue</span> : null}
                    {node.issueReasonCodes.length > 0 && node.sourceKind !== 'recent_issue' ? (
                      <div className="muted-line">{node.issueReasonCodes.slice(0, 2).map(formatIssueReason).join(', ')}</div>
                    ) : null}
                  </td>
                  <td>{node.cohortId}</td>
                  <td>
                    {formatUtc(node.lastHeartbeatUtc)}
                    <div className="muted-line">{formatAge(node.heartbeatAgeSec)} ago</div>
                  </td>
                  <td>{node.agentVersion}</td>
                  <td>
                    {simulated ? `${node.configSeq} (simulated)` : `${node.configSeq} (${formatTrustLower(node.signatureStatus)})`}
                    {node.configDrift ? <span className="delta-chip warn">drift</span> : null}
                  </td>
                  <td>
                    <span className={`delta-chip ${simulated ? 'neutral' : node.signatureStatus === 'invalid' ? 'critical' : node.signatureStatus === 'verified' ? 'ok' : 'neutral'}`}>
                      {simulated ? 'Simulated' : formatTrustLabel(node.signatureStatus)}
                    </span>
                  </td>
                  <td>
                    <span className={`delta-chip ${simulated ? 'neutral' : node.backendConnected ? 'ok' : 'warn'}`}>
                      {simulated ? 'Simulated' : formatControlPlaneLabel(node.backendConnected)}
                    </span>
                  </td>
                  <td>
                    <span className="machine-state-chip" title={formatStateChipTooltip(node)}>
                      {simulated ? 'Simulated state data' : formatStateChip(node)}
                    </span>
                  </td>
                  <td>
                    {simulated ? 'simulated' : node.lastIntervention}
                    <div className="muted-line">{formatRelativeFromNow(node.lastInterventionUtc ?? undefined)}</div>
                  </td>
                  <td>
                    <span className={`delta-chip ${simulated ? 'neutral' : node.degradationTag === 'critical' ? 'critical' : node.degradationTag === 'warning' ? 'warn' : 'ok'}`}>
                      {simulated ? 'Simulated perf data' : formatErrorDegradation(node)}
                    </span>
                  </td>
                  <td>
                    <div className="cohort-row-actions machine-row-actions">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenPeekNodeId((current) => (current === node.nodeId ? '' : node.nodeId));
                        }}
                      >
                        Peek
                      </button>
                      <button
                        type="button"
                        className="machine-inline-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenWhyNodeId((current) => (current === node.nodeId ? '' : node.nodeId));
                        }}
                      >
                        Why is this machine here?
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/audit-traces?agent=${encodeURIComponent(node.nodeId)}`);
                        }}
                      >
                        Open Traces
                      </button>
                    </div>
                  </td>
                </tr>
                {(peekOpen || whyOpen) ? (
                  <tr className="machine-detail-row">
                    <td colSpan={11}>
                      {peekOpen ? (
                        <div className="machine-detail-card">
                          <strong>Quick Peek</strong>
                          <div className="machine-quick-peek-grid">
                            <div><span>Last heartbeat</span><strong>{formatUtc(node.lastHeartbeatUtc)} ({formatAge(node.heartbeatAgeSec)} ago)</strong></div>
                            <div><span>Last policy decision</span><strong>{formatLastPolicyDecision(node)}</strong></div>
                            <div><span>Last intervention</span><strong>{node.lastIntervention} ({formatRelativeFromNow(node.lastInterventionUtc ?? undefined)})</strong></div>
                            <div><span>Last error</span><strong>{formatLastErrorSignal(node)}</strong></div>
                          </div>
                          <div className="machine-quick-events">
                            <strong>Last 10 events</strong>
                            {recentEvents.length === 0 ? (
                              <span className="muted-line">No recent events captured.</span>
                            ) : (
                              recentEvents.map((event) => (
                                <span key={event.traceId}>
                                  {formatUtc(event.timestampUtc)} | {event.decision} | {event.policyId} | conf {event.confidence.toFixed(2)}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      ) : null}
                      {whyOpen ? (
                        <div className="machine-detail-card">
                          <strong>Why this machine appears in list</strong>
                          <p className="machine-why-text">{formatWhyHere(node)}</p>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
          {filteredNodes.length === 0 ? (
            <tr>
              <td colSpan={11} className="muted-line">
                {noCacheWhileDisconnected
                  ? '0 machines shown: disconnected and no cached snapshot.'
                  : `No machines match the current filters in ${scope === 'active' ? 'Active machines' : scope === 'recent_issues' ? 'Recent issues' : 'All known'} scope.`}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </Panel>
  );
}
