import { Panel } from '../../components/Layout/Panel';
import type { ApiError } from '../../api/client';
import type { RolloutEvaluation } from '../../api/rollout';

interface DryRunSimulationProps {
  data: RolloutEvaluation | undefined;
  loading: boolean;
  error: ApiError | undefined;
}

export function DryRunSimulation({ data, loading, error }: DryRunSimulationProps) {
  return (
    <Panel title="Dry-Run SLO Simulation">
      {loading ? <p className="muted-line">Running backend dry-run...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {data ? (
        <>
          <p>Predicted SLO impact:</p>
          <table className="simple-table">
            <tbody>
              <tr>
                <td>error_rate_delta_pct</td>
                <td>{data.dry_run_prediction.error_rate_delta_pct ?? 'n/a'}</td>
              </tr>
              <tr>
                <td>p99_latency_delta_ms</td>
                <td>{data.dry_run_prediction.p99_latency_delta_ms ?? 'n/a'}</td>
              </tr>
              <tr>
                <td>degradation_rate_delta_pct</td>
                <td>{data.dry_run_prediction.degradation_rate_delta_pct ?? 'n/a'}</td>
              </tr>
            </tbody>
          </table>
          {data.dry_run_prediction.availability_reason_code ? (
            <p className="muted-line">
              Metrics unavailable: {data.dry_run_prediction.availability_reason_code}
            </p>
          ) : null}

          <p>Rollout stage progression preview:</p>
          <ol className="inline-stage-list">
            {data.rollout_stage_progression_preview.map((stage) => (
              <li key={stage}>{stage}</li>
            ))}
          </ol>
        </>
      ) : null}
    </Panel>
  );
}

