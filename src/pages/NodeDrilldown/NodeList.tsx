import { useEffect, useMemo, useState } from 'react';
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
  dataMode: MachineDataMode;
  highOverloadThreshold: number;
  highInterventionRateThreshold: number;
}

function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'unknown';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function formatStateValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(2);
}

function formatErrorDegradation(node: NodeDetail): string {
  const errorPart = node.errorRatePct === null ? 'error n/a' : `error ${(node.errorRatePct).toFixed(3)}%`;
  return `${errorPart} / ${node.degradationTag}`;
}

function dataSourceLabel(dataMode: MachineDataMode): string {
  if (dataMode === 'live_stream') return 'Live stream + snapshot';
  if (dataMode === 'demo') return 'Demo fixtures';
  return 'Snapshot poll';
}

export function NodeList({
  nodes,
  loading,
  error,
  lastUpdatedUtc,
  dataMode,
  highOverloadThreshold,
  highInterventionRateThreshold
}: NodeListProps) {
  const navigate = useNavigate();
  const wsStatus = useWsConnectionStatus();
  const [params, setParams] = useSearchParams();
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
  const selectedMachineId = params.get('machine') ?? '';

  useEffect(() => {
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

  const cohorts = useMemo(() => Array.from(new Set(nodes.map((node) => node.cohortId))), [nodes]);

  const filteredNodes = useMemo(() => {
    const query = search.trim().toLowerCase();

    return nodes.filter((node) => {
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
    nodes,
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
    const total = nodes.length;
    const online = nodes.filter((node) => !node.offline).length;
    const offline = total - online;
    const demo = nodes.filter((node) => node.demo).length;
    return { total, online, offline, demo };
  }, [nodes]);

  return (
    <Panel title="Machines truth table">
      {loading ? <p className="muted-line">Loading machine snapshot...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      <div className="machines-data-banner">
        <div>
          <strong>Data source:</strong> {dataSourceLabel(dataMode)}
        </div>
        <div>
          <strong>Connection:</strong> {wsStatus.connected ? 'Connected' : 'Disconnected'}
        </div>
        <div>
          <strong>Last updated:</strong> {formatRelativeFromNow(lastUpdatedUtc)} ({formatUtc(lastUpdatedUtc)})
        </div>
        <div>
          <strong>Counts:</strong> Total {counts.total} | Online {counts.online} | Offline {counts.offline} | Demo {counts.demo}
        </div>
      </div>
      {dataMode === 'demo' || counts.demo > 0 ? (
        <p className="focus-banner">
          Demo data mode is ON. Live machine truth may be masked until control-plane snapshot is available.
        </p>
      ) : null}

      <div className="table-controls">
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

      <table className="simple-table machine-table">
        <thead>
          <tr>
            <th>Machine ID</th>
            <th>Cohort</th>
            <th>Last heartbeat (age)</th>
            <th>Agent version</th>
            <th>Config version</th>
            <th>Signature valid</th>
            <th>Backend connected</th>
            <th>Current state summary</th>
            <th>Last intervention</th>
            <th>Error rate / degradation tag</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredNodes.map((node) => (
            <tr
              key={node.nodeId}
              className={`click-row ${selectedMachineId === node.nodeId ? 'machine-selected-row' : ''}`}
              onClick={() => {
                updateParam('machine', node.nodeId);
              }}
              title="Select machine for drilldown"
            >
              <td>{node.nodeId}</td>
              <td>{node.cohortId}</td>
              <td>
                {formatUtc(node.lastHeartbeatUtc)}
                <div className="muted-line">{formatAge(node.heartbeatAgeSec)} ago</div>
              </td>
              <td>{node.agentVersion}</td>
              <td>
                {node.configSeq}
                {node.configDrift ? <span className="delta-chip warn">drift</span> : null}
              </td>
              <td>{node.signatureStatus === 'verified' ? 'yes' : node.signatureStatus === 'invalid' ? 'no' : 'unknown'}</td>
              <td>{node.backendConnected ? 'yes' : 'no'}</td>
              <td>
                <div className="machine-state-summary">
                  <span>F {formatStateValue(node.stateSummary.focus)}</span>
                  <span>O {formatStateValue(node.stateSummary.overload)}</span>
                  <span>Fa {formatStateValue(node.stateSummary.fatigue)}</span>
                </div>
              </td>
              <td>
                {node.lastIntervention}
                <div className="muted-line">{formatRelativeFromNow(node.lastInterventionUtc ?? undefined)}</div>
              </td>
              <td>
                <span className={`delta-chip ${node.degradationTag === 'critical' ? 'critical' : node.degradationTag === 'warning' ? 'warn' : 'ok'}`}>
                  {formatErrorDegradation(node)}
                </span>
              </td>
              <td>
                <div className="cohort-row-actions machine-row-actions">
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
          ))}
          {filteredNodes.length === 0 ? (
            <tr>
              <td colSpan={11} className="muted-line">No machines match the current filters.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Panel>
  );
}
