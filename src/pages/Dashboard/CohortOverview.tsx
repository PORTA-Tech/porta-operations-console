import { Panel } from '../../components/Layout/Panel';
import { useCohortMetrics } from '../../hooks/useCohortMetrics';
import { CohortTrendLines } from '../../components/Graphs/CohortTrendLines';
import type { CohortId } from '../../types/apiContracts';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function CohortOverview() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const {
    rows,
    loading,
    error,
    window,
    compareMode,
    primaryCohort,
    secondaryCohort,
    primary,
    secondary,
    setWindow,
    setCompareMode,
    setPrimaryCohort,
    setSecondaryCohort
  } = useCohortMetrics();

  useEffect(() => {
    const queryCohort = params.get('cohort');
    if (!queryCohort || rows.length === 0) {
      return;
    }

    const matching = rows.find((row) => row.cohortId === queryCohort);
    if (matching) {
      setPrimaryCohort(matching.cohortId);
    }
  }, [params, rows, setPrimaryCohort]);

  const updateParam = (key: string, value: string, clearValue?: string) => {
    const next = new URLSearchParams(params);
    if (value === '' || (clearValue && value === clearValue)) {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    setParams(next, { replace: true });
  };

  return (
    <Panel title="Cohort comparison">
      <div className="cohort-controls">
        <label>
          Time window
          <select
            value={window}
            onChange={(event) => {
              const selected = event.target.value as '15m' | '1h' | '6h' | '24h';
              setWindow(selected);
              updateParam('window', selected, '1h');
            }}
          >
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="6h">6h</option>
            <option value="24h">24h</option>
          </select>
        </label>
        <label>
          Primary cohort
          <select
            value={primaryCohort}
            onChange={(event) => {
              const cohort = event.target.value as CohortId;
              setPrimaryCohort(cohort);
              updateParam('cohort', cohort);
            }}
          >
            {rows.map((row) => (
              <option key={row.cohortId} value={row.cohortId}>
                {row.cohortId}
              </option>
            ))}
          </select>
        </label>
        <label>
          Side-by-side compare
          <input
            type="checkbox"
            checked={compareMode}
            onChange={(event) => {
              setCompareMode(event.target.checked);
              updateParam('cohortCompare', event.target.checked ? '1' : '', '');
            }}
          />
        </label>
        {compareMode ? (
          <label>
            Secondary cohort
            <select
              value={secondaryCohort}
              onChange={(event) => {
                const cohort = event.target.value as CohortId;
                setSecondaryCohort(cohort);
                updateParam('cohortB', cohort);
              }}
            >
              {rows.map((row) => (
                <option key={row.cohortId} value={row.cohortId}>
                  {row.cohortId}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {loading ? <p>Loading cohort summaries...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      {!loading && !error ? (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Cohort</th>
              <th>Nodes</th>
              <th>Error %</th>
              <th>P50</th>
              <th>P95</th>
              <th>P99</th>
              <th>Performance regression %</th>
              <th>Config version distribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.cohortId}
                className="click-row"
                onClick={() => navigate(`/machines?cohort=${encodeURIComponent(row.cohortId)}`)}
                title="Open machines in this cohort"
              >
                <td>{row.cohortId}</td>
                <td>{row.nodeCount}</td>
                <td>{row.errorRatePct.toFixed(3)}</td>
                <td>{row.latencyP50Ms} ms</td>
                <td>{row.latencyP95Ms} ms</td>
                <td>{row.latencyP99Ms} ms</td>
                <td>{row.degradationRatePct.toFixed(3)}</td>
                <td>{Object.entries(row.configSeqDistribution).map(([k, v]) => `${k}:${v}`).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div className="trend-panel">
        <h4>Error rate trend</h4>
        <CohortTrendLines primary={primary} secondary={secondary} compareMode={compareMode} />
      </div>

      {compareMode && primary && secondary ? (
        <div className="compare-panel">
          <h4>Comparison summary</h4>
          <p>
            {primary.cohortId} vs {secondary.cohortId}: error delta{' '}
            <strong>{(primary.errorRatePct - secondary.errorRatePct).toFixed(3)}%</strong>, p99 delta{' '}
            <strong>{primary.latencyP99Ms - secondary.latencyP99Ms} ms</strong>.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

