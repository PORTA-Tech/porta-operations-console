import { Panel } from '../../components/Layout/Panel';
import { useCohortMetrics } from '../../hooks/useCohortMetrics';
import { CohortTrendLines } from '../../components/Graphs/CohortTrendLines';
import type { CohortId } from '@porta/api-contracts';

export function CohortOverview() {
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

  return (
    <Panel title="Cohort Intelligence">
      <div className="cohort-controls">
        <label>
          Window
          <select value={window} onChange={(event) => setWindow(event.target.value as '15m' | '1h' | '6h' | '24h')}>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="6h">6h</option>
            <option value="24h">24h</option>
          </select>
        </label>
        <label>
          Primary
          <select value={primaryCohort} onChange={(event) => setPrimaryCohort(event.target.value as CohortId)}>
            {rows.map((row) => (
              <option key={row.cohortId} value={row.cohortId}>
                {row.cohortId}
              </option>
            ))}
          </select>
        </label>
        <label>
          Side-by-side
          <input type="checkbox" checked={compareMode} onChange={(event) => setCompareMode(event.target.checked)} />
        </label>
        {compareMode ? (
          <label>
            Secondary
            <select value={secondaryCohort} onChange={(event) => setSecondaryCohort(event.target.value as CohortId)}>
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
              <th>Degradation %</th>
              <th>config_seq distribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cohortId}>
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
        <h4>Trend Lines (Error Rate)</h4>
        <CohortTrendLines primary={primary} secondary={secondary} compareMode={compareMode} />
      </div>

      {compareMode && primary && secondary ? (
        <div className="compare-panel">
          <h4>Side-by-Side Comparison</h4>
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

