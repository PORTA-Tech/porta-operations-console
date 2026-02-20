import { Panel } from '../../components/Layout/Panel';
import { useAdapterObservability } from '../../hooks/useAdapterObservability';
import { formatUtc } from '../../utils/date';

export function AdapterObservabilityPanel() {
  const { rows, replayRows, selectedCohort, loading, replayLoading, error, replayError, setSelectedCohort } =
    useAdapterObservability();

  return (
    <Panel title="Adapter Observability (Per Cohort)">
      {loading ? <p className="muted-line">Loading adapter observability...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      {!loading && !error ? (
        <table className="simple-table">
          <thead>
            <tr>
              <th>cohort</th>
              <th>adapter error rate</th>
              <th>adapter latency</th>
              <th>circuit breaker state</th>
              <th>sampled at</th>
              <th>replay log access</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cohort}>
                <td>{row.cohort}</td>
                <td>{row.adapter_error_rate_pct.toFixed(3)}%</td>
                <td>{Math.round(row.adapter_latency_ms)} ms</td>
                <td>
                  <strong>{row.circuit_breaker_state}</strong>
                </td>
                <td>{formatUtc(row.sampled_at_utc)}</td>
                <td>
                  <button type="button" onClick={() => setSelectedCohort(row.cohort)}>
                    Open replay log
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div className="trend-panel">
        <h4>Replay Log {selectedCohort ? `(${selectedCohort})` : ''}</h4>
        {replayLoading ? <p className="muted-line">Loading replay log...</p> : null}
        {replayError ? <p className="error-line">{replayError.code}: {replayError.message}</p> : null}
        {!replayLoading && !replayError ? (
          <table className="simple-table">
            <thead>
              <tr>
                <th>timestamp</th>
                <th>action</th>
                <th>outcome</th>
                <th>correlation_id</th>
              </tr>
            </thead>
            <tbody>
              {replayRows.map((row) => (
                <tr key={row.event_id}>
                  <td>{formatUtc(row.timestamp_utc)}</td>
                  <td>{row.action}</td>
                  <td>{row.outcome}</td>
                  <td>{row.correlation_id}</td>
                </tr>
              ))}
              {replayRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted-line">
                    No replay log entries for this cohort.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
