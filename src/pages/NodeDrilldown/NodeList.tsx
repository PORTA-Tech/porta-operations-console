import { useEffect, useMemo, useState } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { formatUtc } from '../../utils/date';
import type { ApiError } from '../../api/client';
import type { NodeDetail } from '../../types/ui';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface NodeListProps {
  nodes: NodeDetail[];
  loading: boolean;
  error: ApiError | undefined;
}

export function NodeList({ nodes, loading, error }: NodeListProps) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [cohortFilter, setCohortFilter] = useState(params.get('cohort') ?? 'all');
  const [signatureFilter, setSignatureFilter] = useState('all');
  const [degradationFilter, setDegradationFilter] = useState('all');
  const [sloFilter, setSloFilter] = useState('all');

  useEffect(() => {
    setSearch(params.get('search') ?? '');
    setCohortFilter(params.get('cohort') ?? 'all');
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
      const signatureValid =
        node.signatureStatus === 'verified'
          ? 'valid'
          : node.signatureStatus === 'invalid'
            ? 'invalid'
            : 'unknown';
      const sloCompliance = node.sloCompliant ? 'compliant' : 'breach';

      const matchesSearch =
        !query ||
        [
          node.nodeId,
          node.cohortId,
          String(node.configSeq),
          signatureValid,
          formatUtc(node.lastHeartbeatUtc),
          node.degradationState,
          sloCompliance
        ].some((value) => value.toLowerCase().includes(query));

      if (!matchesSearch) return false;
      if (cohortFilter !== 'all' && node.cohortId !== cohortFilter) return false;
      if (signatureFilter !== 'all' && signatureValid !== signatureFilter) return false;
      if (degradationFilter !== 'all' && node.degradationState !== degradationFilter) return false;
      if (sloFilter !== 'all' && sloCompliance !== sloFilter) return false;

      return true;
    });
  }, [nodes, search, cohortFilter, signatureFilter, degradationFilter, sloFilter]);

  return (
    <Panel title="Machine snapshot">
      {loading ? <p className="muted-line">Loading node snapshot...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      <div className="table-controls">
        <input
          className="table-search-input"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            updateParam('search', event.target.value);
          }}
          placeholder="Search machine snapshot..."
          aria-label="Search machine snapshot"
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
        <select value={signatureFilter} onChange={(event) => setSignatureFilter(event.target.value)} aria-label="Filter by signature">
          <option value="all">All signature states</option>
          <option value="valid">Valid</option>
          <option value="invalid">Invalid</option>
          <option value="unknown">Unknown</option>
        </select>
        <select value={degradationFilter} onChange={(event) => setDegradationFilter(event.target.value)} aria-label="Filter by degradation">
          <option value="all">All degradation states</option>
          <option value="normal">Normal</option>
          <option value="degraded">Degraded</option>
          <option value="safe">Safe</option>
        </select>
        <select value={sloFilter} onChange={(event) => setSloFilter(event.target.value)} aria-label="Filter by SLO compliance">
          <option value="all">All SLO states</option>
          <option value="compliant">Compliant</option>
          <option value="breach">Breach</option>
        </select>
      </div>

      <table className="simple-table">
        <thead>
          <tr>
            <th>Machine ID</th>
            <th>cohort</th>
            <th>Config version</th>
            <th>Trust check</th>
            <th>Last heartbeat</th>
            <th>Performance state</th>
            <th>SLO state</th>
          </tr>
        </thead>
        <tbody>
          {filteredNodes.map((node) => (
            <tr
              key={node.nodeId}
              className="click-row"
              onClick={() => navigate(`/audit-traces?agent=${encodeURIComponent(node.nodeId)}`)}
              title="Open policy decisions for this machine"
            >
              <td>{node.nodeId}</td>
              <td>{node.cohortId}</td>
              <td>{node.configSeq}</td>
              <td>
                {node.signatureStatus === 'verified'
                  ? 'valid'
                  : node.signatureStatus === 'invalid'
                    ? 'invalid'
                    : 'unknown'}
              </td>
              <td>{formatUtc(node.lastHeartbeatUtc)}</td>
              <td>{node.degradationState}</td>
              <td>{node.sloCompliant ? 'compliant' : 'breach'}</td>
            </tr>
          ))}
          {filteredNodes.length === 0 ? (
            <tr>
              <td colSpan={7} className="muted-line">No nodes match the current search and filters.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Panel>
  );
}

