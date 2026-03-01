import { Panel } from '../../components/Layout/Panel';
import { useAdapterObservability } from '../../hooks/useAdapterObservability';
import { formatUtc } from '../../utils/date';
import type { RolloutEvaluation } from '../../api/rollout';

interface AdapterObservabilityPanelProps {
  evaluation: RolloutEvaluation | undefined;
}

function rowReplayEnabled(
  row: ReturnType<typeof useAdapterObservability>['rows'][number],
  evaluation: RolloutEvaluation | undefined
): { enabled: boolean; reason?: string } {
  const canViewReplay = row.permissions?.can_view_replay_logs
    ?? evaluation?.permissions?.can_view_replay_logs
    ?? true;
  if (!canViewReplay) {
    return { enabled: false, reason: row.permissions?.blocked_reason_code ?? 'REPLAY_NOT_ALLOWED' };
  }
  if (typeof row.replay_log_count === 'number' && row.replay_log_count <= 0) {
    return { enabled: false, reason: 'NO_REPLAY_LOGS' };
  }
  return { enabled: true };
}

function isFeatureGateDisabled(
  rows: ReturnType<typeof useAdapterObservability>['rows'],
  evaluation: RolloutEvaluation | undefined
): boolean {
  const hasGateFail = evaluation?.guardrail_eval.some(
    (guardrail) => guardrail.guardrail_id === 'FEATURE_GATE' && guardrail.status === 'FAIL'
  ) ?? false;
  if (hasGateFail) {
    return true;
  }
  return rows.length > 0 && rows.every((row) => row.availability_reason_code === 'FEATURE_GATE_DISABLED');
}

export function AdapterObservabilityPanel({ evaluation }: AdapterObservabilityPanelProps) {
  const { rows, replayRows, selectedCohort, loading, replayLoading, error, replayError, setSelectedCohort } =
    useAdapterObservability();
  const featureGateDisabled = isFeatureGateDisabled(rows, evaluation);

  const table = (
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
        {rows.map((row) => {
          const replayState = rowReplayEnabled(row, evaluation);
          return (
            <tr key={row.cohort}>
              <td>{row.cohort}</td>
              <td>{row.adapter_error_rate_pct === null ? 'n/a' : `${row.adapter_error_rate_pct.toFixed(3)}%`}</td>
              <td>{row.adapter_latency_ms === null ? 'n/a' : `${Math.round(row.adapter_latency_ms)} ms`}</td>
              <td>
                <strong>{row.circuit_breaker_state}</strong>
              </td>
              <td>{formatUtc(row.sampled_at_utc)}</td>
              <td>
                <button type="button" onClick={() => setSelectedCohort(row.cohort)} disabled={!replayState.enabled}>
                  Open replay log
                </button>
                {typeof row.replay_log_count === 'number' ? (
                  <p className="muted-line">Replay logs: {row.replay_log_count}</p>
                ) : null}
                {!replayState.enabled ? (
                  <p className="muted-line">{replayState.reason ?? 'Replay unavailable'}</p>
                ) : null}
                {!row.metrics_available ? (
                  <p className="muted-line">
                    {row.availability_reason_code ?? 'Metrics unavailable'} ({row.sample_size}/{row.sample_min_required})
                  </p>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <Panel title="Adapter Observability (Per Cohort)">
      {loading ? <p className="muted-line">Loading adapter observability...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      {!loading && !error && featureGateDisabled ? (
        <div className="focus-banner">
          Adapter is disabled by policy (<strong>FEATURE_GATE_DISABLED</strong>). No adapter metrics available.
        </div>
      ) : null}

      {!loading && !error && !featureGateDisabled ? table : null}
      {!loading && !error && featureGateDisabled ? (
        <details>
          <summary>Details</summary>
          {table}
        </details>
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
