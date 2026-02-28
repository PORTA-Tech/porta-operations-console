import { useMemo, useState } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { MetricCard } from '../../components/Tables/MetricCard';
import { CohortTrendLines } from '../../components/Graphs/CohortTrendLines';
import { useCohortMetrics } from '../../hooks/useCohortMetrics';
import type { CohortId } from '../../types/apiContracts';

export function ExperimentsPage() {
  const {
    rows,
    loading,
    error,
    window,
    primary,
    secondary,
    primaryCohort,
    secondaryCohort,
    setWindow,
    setPrimaryCohort,
    setSecondaryCohort,
    setCompareMode
  } = useCohortMetrics();

  const [name, setName] = useState('Overload threshold tuning');
  const [hypothesis, setHypothesis] = useState('Reducing notification pressure lowers overload without degrading latency.');

  const scorecard = useMemo(() => {
    if (!primary || !secondary) {
      return null;
    }

    return {
      errorDelta: primary.errorRatePct - secondary.errorRatePct,
      p99Delta: primary.latencyP99Ms - secondary.latencyP99Ms,
      degradationDelta: primary.degradationRatePct - secondary.degradationRatePct
    };
  }, [primary, secondary]);

  const summaryText = scorecard
    ? `${primary?.cohortId ?? 'Primary'} vs ${secondary?.cohortId ?? 'Secondary'}: `
      + `${scorecard.errorDelta >= 0 ? '+' : ''}${scorecard.errorDelta.toFixed(3)}% Error Rate, `
      + `${scorecard.p99Delta >= 0 ? '+' : ''}${scorecard.p99Delta}ms p99, `
      + `${scorecard.degradationDelta >= 0 ? '+' : ''}${scorecard.degradationDelta.toFixed(3)}% Delta vs Baseline.`
    : 'Choose baseline and experiment cohorts to generate a scorecard.';

  return (
    <div className="stack">
      <Panel title="Experiment setup">
        <div className="ops-grid">
          <div className="ops-editor">
            <label>
              Experiment name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Hypothesis
              <input value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} />
            </label>
            <label>
              Time window
              <select value={window} onChange={(event) => setWindow(event.target.value as '15m' | '1h' | '6h' | '24h')}>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="6h">6h</option>
                <option value="24h">24h</option>
              </select>
            </label>
            <label>
              Baseline cohort
              <select value={secondaryCohort} onChange={(event) => setSecondaryCohort(event.target.value as CohortId)}>
                {rows.map((row) => (
                  <option key={row.cohortId} value={row.cohortId}>
                    {row.cohortId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Experiment cohort
              <select value={primaryCohort} onChange={(event) => setPrimaryCohort(event.target.value as CohortId)}>
                {rows.map((row) => (
                  <option key={row.cohortId} value={row.cohortId}>
                    {row.cohortId}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setCompareMode(true)}>
              Enable compare mode
            </button>
          </div>
          <div className="panel">
            <h4>Hypothesis summary</h4>
            <p><strong>{name}</strong></p>
            <p>{hypothesis}</p>
            <p className="muted-line">{summaryText}</p>
          </div>
        </div>
      </Panel>

      <div className="grid-three">
        <MetricCard
          title="Error Rate Delta"
          value={scorecard ? `${scorecard.errorDelta.toFixed(3)}%` : 'n/a'}
          note="Experiment minus baseline"
        />
        <MetricCard
          title="P99 Latency Delta"
          value={scorecard ? `${scorecard.p99Delta} ms` : 'n/a'}
          note="Experiment minus baseline"
        />
        <MetricCard
          title="Delta vs Baseline"
          value={scorecard ? `${scorecard.degradationDelta.toFixed(3)}%` : 'n/a'}
          note="Experiment minus baseline"
        />
      </div>

      <Panel title="Before/after overlays">
        {loading ? <p className="muted-line">Loading cohort trends...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
        {!loading && !error ? <CohortTrendLines primary={primary} secondary={secondary} compareMode /> : null}
      </Panel>
    </div>
  );
}
