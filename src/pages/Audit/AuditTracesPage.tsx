import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { useConsoleOperations } from '../../hooks/useConsoleOperations';
import { getNodeSnapshot } from '../../api/nodes';

export function AuditTracesPage() {
  const [params, setParams] = useSearchParams();
  const { audits, policies, loading, error, replay, exportRows } = useConsoleOperations();
  const [policyFilter, setPolicyFilter] = useState('all');
  const [decisionFilter, setDecisionFilter] = useState('all');
  const [cohortFilter, setCohortFilter] = useState(params.get('cohort') ?? 'all');
  const [agentFilter, setAgentFilter] = useState(params.get('agent') ?? 'all');
  const [traceFocus, setTraceFocus] = useState(params.get('trace') ?? '');
  const [correlationFilter, setCorrelationFilter] = useState(params.get('correlation') ?? '');
  const [confidenceMin, setConfidenceMin] = useState(0);
  const [agentCohortMap, setAgentCohortMap] = useState<Record<string, string>>({});
  const [cohortOptions, setCohortOptions] = useState<string[]>([]);

  useEffect(() => {
    setCohortFilter(params.get('cohort') ?? 'all');
    setAgentFilter(params.get('agent') ?? 'all');
    setTraceFocus(params.get('trace') ?? '');
    setCorrelationFilter(params.get('correlation') ?? '');
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

  const filtered = useMemo(
    () =>
      audits.filter((row) => {
        if (policyFilter !== 'all' && row.policy_id !== policyFilter) return false;
        if (decisionFilter !== 'all' && row.action_decision !== decisionFilter) return false;
        if (cohortFilter !== 'all' && agentCohortMap[row.agent_id] !== cohortFilter) return false;
        if (agentFilter !== 'all' && row.agent_id !== agentFilter) return false;
        if (traceFocus && row.trace_id !== traceFocus) return false;
        if (correlationFilter && row.correlation_id !== correlationFilter) return false;
        if (row.confidence_score < confidenceMin) return false;
        return true;
      }),
    [agentCohortMap, agentFilter, audits, cohortFilter, confidenceMin, correlationFilter, decisionFilter, policyFilter, traceFocus]
  );

  return (
    <div className="stack">
      <Panel title="Audit ledger and trace replay">
        {loading ? <p className="muted-line">Loading traces...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

        <div className="table-controls">
          <select value={policyFilter} onChange={(event) => setPolicyFilter(event.target.value)}>
            <option value="all">All policies</option>
            {policies.map((policy) => (
              <option key={policy.policy_id} value={policy.policy_id}>
                {policy.name}
              </option>
            ))}
          </select>
          <select value={decisionFilter} onChange={(event) => setDecisionFilter(event.target.value)}>
            <option value="all">All decisions</option>
            <option value="intervene">intervene</option>
            <option value="skip">skip</option>
            <option value="cooldown">cooldown</option>
            <option value="blocked">blocked</option>
          </select>
          <select
            value={cohortFilter}
            onChange={(event) => {
              setCohortFilter(event.target.value);
              updateParam('cohort', event.target.value, 'all');
            }}
          >
            <option value="all">All cohorts</option>
            {cohortOptions.map((cohort) => (
              <option key={cohort} value={cohort}>
                {cohort}
              </option>
            ))}
          </select>
          <label>
            Confidence &gt;=
            <input type="number" min={0} max={1} step="0.05" value={confidenceMin} onChange={(event) => setConfidenceMin(Number(event.target.value))} />
          </label>
          <input
            className="table-search-input"
            placeholder="Filter by machine id..."
            value={agentFilter === 'all' ? '' : agentFilter}
            onChange={(event) => {
              const next = event.target.value.trim();
              setAgentFilter(next === '' ? 'all' : next);
              updateParam('agent', next, '');
            }}
          />
          <input
            className="table-search-input"
            placeholder="Focus trace id..."
            value={traceFocus}
            onChange={(event) => {
              setTraceFocus(event.target.value);
              updateParam('trace', event.target.value);
            }}
          />
          <input
            className="table-search-input"
            placeholder="Focus correlation id..."
            value={correlationFilter}
            onChange={(event) => {
              setCorrelationFilter(event.target.value);
              updateParam('correlation', event.target.value);
            }}
          />
          <button type="button" onClick={() => void exportRows('csv', filtered)}>Export CSV</button>
          <button type="button" onClick={() => void exportRows('json', filtered)}>Export JSON</button>
        </div>

        <table className="simple-table">
          <thead>
            <tr>
              <th>Trace ID</th>
              <th>Correlation ID</th>
              <th>Timestamp</th>
              <th>Machine ID</th>
              <th>Policy ID</th>
              <th>Decision</th>
              <th>Confidence</th>
              <th>Triggered by</th>
              <th>Config Trust</th>
              <th>Replay</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.trace_id}
                className={!row.signature_valid ? 'row-alert click-row' : 'click-row'}
                onClick={() => {
                  setTraceFocus(row.trace_id);
                  updateParam('trace', row.trace_id);
                }}
              >
                <td>{row.trace_id}</td>
                <td>{row.correlation_id || 'n/a'}</td>
                <td>{new Date(row.timestamp).toLocaleString()}</td>
                <td>{row.agent_id}</td>
                <td>{row.policy_id}</td>
                <td>{row.action_decision}</td>
                <td>{row.confidence_score.toFixed(2)}</td>
                <td>{row.triggered_by}</td>
                <td>{row.signature_valid ? 'OK' : 'FAIL'}</td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      void replay(row.trace_id).then((outcome) => {
                        window.alert(`Replay: ${outcome.result} (${outcome.details})`);
                      })
                    }
                  >
                    Replay
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="muted-line">No traces match current filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
