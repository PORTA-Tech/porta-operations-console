import { Panel } from '../../components/Layout/Panel';
import { useCohortMetrics } from '../../hooks/useCohortMetrics';

export function CohortOverview() {
  const metrics = useCohortMetrics();

  return (
    <Panel title="Cohort Intelligence">
      <p>Cohort: <strong>{metrics.cohortId}</strong></p>
      <p>Error Rate: <strong>{metrics.errorRatePct}%</strong></p>
      <p>P99 Latency: <strong>{metrics.p99LatencyMs} ms</strong></p>
      <p>Drift Risk: <strong>{metrics.driftRisk}</strong></p>
    </Panel>
  );
}

