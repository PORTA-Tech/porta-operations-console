import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { MetricCard } from '../../components/Tables/MetricCard';
import { useCohortMetrics } from '../../hooks/useCohortMetrics';
import type { CohortId } from '../../types/apiContracts';
import { formatUtc } from '../../utils/date';
import {
  evaluateExperiment,
  type ExperimentEvaluation,
  type ExperimentGuardrailMetric,
  type ExperimentPrimaryMetric
} from '../../api/experiments';
import { toApiError, type ApiError } from '../../api/client';

const defaultPrimaryMetrics: ExperimentPrimaryMetric[] = ['overload_likelihood', 'focus_strength'];
const defaultGuardrails: Array<{ metric: ExperimentGuardrailMetric; threshold: number; label: string }> = [
  { metric: 'p99_latency_delta', threshold: 20, label: 'P99 latency delta (ms)' },
  { metric: 'error_rate_delta', threshold: 0.1, label: 'Error rate delta (%)' },
  { metric: 'degradation_delta', threshold: 0.5, label: 'Degradation delta (%)' }
];

function metricLabel(metric: ExperimentPrimaryMetric): string {
  if (metric === 'overload_likelihood') return 'Overload likelihood';
  if (metric === 'focus_strength') return 'Focus strength';
  return 'Fatigue probability';
}

function guardrailLabel(metric: ExperimentGuardrailMetric): string {
  if (metric === 'p99_latency_delta') return 'P99 latency delta';
  if (metric === 'error_rate_delta') return 'Error rate delta';
  if (metric === 'degradation_delta') return 'Degradation delta';
  return 'Intervention thrash rate';
}

function formatGuardrailValue(metric: ExperimentGuardrailMetric, value: number): string {
  if (metric === 'p99_latency_delta') {
    return `${value >= 0 ? '+' : ''}${Math.round(value)}ms`;
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}%`;
}

function formatNullableNumber(value: number | null, decimals = 4): string {
  if (value === null || !Number.isFinite(value)) {
    return 'n/a';
  }
  return value.toFixed(decimals);
}

function formatNullableGuardrailValue(metric: ExperimentGuardrailMetric, value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'n/a';
  }
  return formatGuardrailValue(metric, value);
}

function verdictTone(status: ExperimentEvaluation['verdict']['status']): 'ok' | 'warn' | 'critical' {
  if (status === 'improvement_confirmed') return 'ok';
  if (status === 'inconclusive') return 'warn';
  return 'critical';
}

function confidenceChip(level: ExperimentEvaluation['confidence']['level']): 'ok' | 'warn' | 'critical' {
  if (level === 'high') return 'ok';
  if (level === 'medium') return 'warn';
  return 'critical';
}

function polylinePoints(values: number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-9, max - min);
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 92 - ((value - min) / range) * 84;
      return `${x},${y}`;
    })
    .join(' ');
}

export function ExperimentsPage() {
  const navigate = useNavigate();
  const {
    rows,
    window,
    primaryCohort,
    secondaryCohort,
    setWindow,
    setPrimaryCohort,
    setSecondaryCohort
  } = useCohortMetrics();

  const [name, setName] = useState('Overload threshold tuning');
  const [hypothesis, setHypothesis] = useState(
    'Reducing notification pressure lowers overload without degrading latency.'
  );
  const [policyVersion, setPolicyVersion] = useState('');
  const [configSeq, setConfigSeq] = useState('');
  const [thresholdSet, setThresholdSet] = useState('');
  const [primaryMetrics, setPrimaryMetrics] = useState<ExperimentPrimaryMetric[]>(defaultPrimaryMetrics);
  const [guardrailConfig, setGuardrailConfig] = useState(defaultGuardrails);
  const [minSampleMachines, setMinSampleMachines] = useState(20);
  const [minCoveragePct, setMinCoveragePct] = useState(70);
  const [minWindowMinutes, setMinWindowMinutes] = useState(10);
  const [evaluation, setEvaluation] = useState<ExperimentEvaluation | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | undefined>();

  const ready = rows.length > 0;
  const baselineCohortId = (secondaryCohort || 'stable') as CohortId;
  const experimentCohortId = (primaryCohort || 'canary-1') as CohortId;

  const request = useMemo(() => ({
    name,
    hypothesis,
    window,
    baseline_cohort_id: baselineCohortId,
    experiment_cohort_id: experimentCohortId,
    ...(policyVersion.trim() || configSeq.trim() || thresholdSet.trim()
      ? {
          change_vector: {
            ...(policyVersion.trim() ? { policy_version: policyVersion.trim() } : {}),
            ...(configSeq.trim() && Number.isFinite(Number(configSeq))
              ? { config_seq: Math.max(0, Math.trunc(Number(configSeq))) }
              : {}),
            ...(thresholdSet.trim() ? { threshold_set: thresholdSet.trim() } : {})
          }
        }
      : {}),
    primary_metrics: primaryMetrics,
    guardrails: guardrailConfig.map((entry) => ({
      metric: entry.metric,
      threshold: entry.threshold
    })),
    min_sample_machines: minSampleMachines,
    min_coverage_pct: minCoveragePct,
    min_window_minutes: minWindowMinutes
  }), [
    baselineCohortId,
    configSeq,
    experimentCohortId,
    guardrailConfig,
    hypothesis,
    name,
    policyVersion,
    primaryMetrics,
    thresholdSet,
    minSampleMachines,
    minCoveragePct,
    minWindowMinutes,
    window
  ]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    let mounted = true;
    const refresh = async (): Promise<void> => {
      setLoading(true);
      try {
        const next = await evaluateExperiment(request);
        if (!mounted) return;
        setEvaluation(next);
        setError(undefined);
      } catch (err) {
        if (!mounted) return;
        setError(toApiError(err));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void refresh();
    const timer = globalThis.window.setInterval(() => {
      void refresh();
    }, 10_000);

    return () => {
      mounted = false;
      globalThis.window.clearInterval(timer);
    };
  }, [ready, request]);

  const baselineSeries = evaluation?.timeline.baseline ?? [];
  const experimentSeries = evaluation?.timeline.experiment ?? [];
  const overlayMetricValues = {
    baseline: baselineSeries.map((point) => point.error_rate_pct),
    experiment: experimentSeries.map((point) => point.error_rate_pct)
  };

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
              <select value={baselineCohortId} onChange={(event) => setSecondaryCohort(event.target.value as CohortId)}>
                {rows.map((row) => (
                  <option key={row.cohortId} value={row.cohortId}>{row.cohortId}</option>
                ))}
              </select>
            </label>
            <label>
              Experiment cohort
              <select value={experimentCohortId} onChange={(event) => setPrimaryCohort(event.target.value as CohortId)}>
                {rows.map((row) => (
                  <option key={row.cohortId} value={row.cohortId}>{row.cohortId}</option>
                ))}
              </select>
            </label>
            <label>
              Change policy version
              <input value={policyVersion} onChange={(event) => setPolicyVersion(event.target.value)} placeholder="optional" />
            </label>
            <label>
              Change config seq
              <input value={configSeq} onChange={(event) => setConfigSeq(event.target.value)} placeholder="optional" />
            </label>
            <label>
              Change threshold set
              <input value={thresholdSet} onChange={(event) => setThresholdSet(event.target.value)} placeholder="optional" />
            </label>
          </div>

          <div className="panel">
            <h4>Primary metrics (max 2)</h4>
            {(['overload_likelihood', 'focus_strength', 'fatigue_probability'] as ExperimentPrimaryMetric[]).map((metric) => {
              const selected = primaryMetrics.includes(metric);
              return (
                <label key={metric}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setPrimaryMetrics((current) => {
                          const next = Array.from(new Set([...current, metric]));
                          return next.slice(0, 2);
                        });
                        return;
                      }
                      setPrimaryMetrics((current) => current.filter((entry) => entry !== metric));
                    }}
                  />
                  {metricLabel(metric)}
                </label>
              );
            })}

            <h4>Guardrails</h4>
            {guardrailConfig.map((entry, index) => (
              <label key={entry.metric}>
                {entry.label}
                <input
                  value={entry.threshold}
                  onChange={(event) =>
                    setGuardrailConfig((current) => {
                      const parsed = Number(event.target.value);
                      return current.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              threshold: Number.isFinite(parsed) ? parsed : item.threshold
                            }
                          : item
                      );
                    })
                  }
                />
              </label>
            ))}
            <h4>Data validity gates</h4>
            <label>
              Min machines required
              <input
                value={minSampleMachines}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed)) {
                    setMinSampleMachines(Math.max(1, Math.trunc(parsed)));
                  }
                }}
              />
            </label>
            <label>
              Min coverage %
              <input
                value={minCoveragePct}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed)) {
                    setMinCoveragePct(Math.max(1, Math.min(100, parsed)));
                  }
                }}
              />
            </label>
            <label>
              Min window minutes
              <input
                value={minWindowMinutes}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed)) {
                    setMinWindowMinutes(Math.max(1, Math.trunc(parsed)));
                  }
                }}
              />
            </label>
          </div>
        </div>
      </Panel>

      <Panel title="Verdict">
        {loading ? <p className="muted-line">Evaluating experiment...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
        {evaluation ? (
          <>
            <div className={`cohort-insight-banner ${verdictTone(evaluation.verdict.status)}`}>
              <strong>Verdict:</strong> {evaluation.verdict.status.replaceAll('_', ' ')}. {evaluation.verdict.summary}
            </div>
            <p className="muted-line">
              Last evaluated: {formatUtc(evaluation.evaluated_at_utc)} | Triggered by: {evaluation.verdict.triggered_by}
            </p>
            <p className="muted-line">
              Trigger code: {evaluation.verdict.trigger_reason_code}
            </p>
            <p className="muted-line">
              Trigger details:{' '}
              {Object.entries(evaluation.verdict.trigger_reason_details)
                .map(([key, value]) => `${key}=${value === null ? 'null' : String(value)}`)
                .join(', ')}
            </p>
            <p className="muted-line">
              Confidence:
              <span className={`delta-chip ${confidenceChip(evaluation.confidence.level)}`}>
                {evaluation.confidence.level} ({evaluation.confidence.machine_count} machines)
              </span>
              {' '}freshness {evaluation.confidence.freshness_seconds}s
            </p>
            <p className="muted-line">
              Data quality: Baseline sample {evaluation.data_quality.baseline_sample_machines} (coverage {evaluation.data_quality.baseline_coverage_pct.toFixed(1)}%) | Experiment sample {evaluation.data_quality.experiment_sample_machines} (coverage {evaluation.data_quality.experiment_coverage_pct.toFixed(1)}%) | Min sample {evaluation.data_quality.min_sample_machines} | Min coverage {evaluation.data_quality.min_coverage_pct.toFixed(1)}% | Window {evaluation.data_quality.window_minutes}m (min {evaluation.data_quality.min_window_minutes}m)
            </p>
            {!evaluation.data_quality.valid ? (
              <p className="error-line">Not enough data to evaluate: {evaluation.data_quality.messages.join(' ')}</p>
            ) : null}
            <p className="muted-line">{evaluation.confidence.reasons.join(' ')}</p>
          </>
        ) : (
          <p className="muted-line">Waiting for experiment evaluation.</p>
        )}
      </Panel>

      <div className="grid-three">
        <MetricCard
          title="Primary Metrics Improved"
          value={
            evaluation
              ? evaluation.data_quality.sample_valid
                ? `${evaluation.metrics.primary.filter((metric) => metric.improved === true).length}/${evaluation.metrics.primary.length}`
                : 'Not evaluated'
              : 'n/a'
          }
          note={evaluation && !evaluation.data_quality.sample_valid ? 'Insufficient sample' : 'Backend evaluator result'}
        />
        <MetricCard
          title="Guardrail Violations"
          value={
            evaluation
              ? evaluation.data_quality.sample_valid
                ? `${evaluation.metrics.guardrails.filter((guardrail) => guardrail.violated === true).length}`
                : 'Not evaluated'
              : 'n/a'
          }
          note={evaluation && !evaluation.data_quality.sample_valid ? 'Insufficient sample' : 'Backend guardrail checks'}
        />
        <MetricCard
          title="Intervention Thrash Delta"
          value={
            evaluation
              ? evaluation.metrics.interventions_per_min_delta.delta === null
                ? 'n/a'
                : `${evaluation.metrics.interventions_per_min_delta.delta.toFixed(3)} /min`
              : 'n/a'
          }
          note={evaluation && !evaluation.data_quality.sample_valid ? 'Unavailable (insufficient sample)' : 'Experiment minus baseline'}
        />
      </div>

      <Panel title="Evaluation Details">
        {evaluation ? (
          <table className="simple-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Metric</th>
                <th>Baseline</th>
                <th>Experiment</th>
                <th>Delta</th>
                <th>Threshold / Target</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.metrics.primary.map((metric) => (
                <tr key={`primary-${metric.metric}`}>
                  <td>Primary</td>
                  <td>{metricLabel(metric.metric)}</td>
                  <td>{formatNullableNumber(metric.baseline_value)}</td>
                  <td>{formatNullableNumber(metric.experiment_value)}</td>
                  <td>{formatNullableNumber(metric.delta)}</td>
                  <td>{metric.target_delta.toFixed(4)}</td>
                  <td>{metric.improved === null ? 'Not evaluated' : metric.improved ? 'Improved' : 'Not met'}</td>
                </tr>
              ))}
              {evaluation.metrics.guardrails.map((guardrail) => (
                <tr key={`guardrail-${guardrail.metric}`}>
                  <td>Guardrail</td>
                  <td>{guardrailLabel(guardrail.metric)}</td>
                  <td>{formatNullableNumber(guardrail.baseline_value)}</td>
                  <td>{formatNullableNumber(guardrail.experiment_value)}</td>
                  <td>{formatNullableGuardrailValue(guardrail.metric, guardrail.delta)}</td>
                  <td>{formatGuardrailValue(guardrail.metric, guardrail.threshold)}</td>
                  <td>
                    {guardrail.violated === null
                      ? 'Not evaluated'
                      : guardrail.violated
                        ? (guardrail.strong_violation ? 'Strong violation' : 'Violated')
                        : 'Healthy'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted-line">No evaluation output yet.</p>
        )}
      </Panel>

      <Panel title="Before/after overlays">
        {evaluation ? (
          <>
            <svg viewBox="0 0 100 100" className="trend-svg" role="img" aria-label="Experiment error-rate overlay">
              <polyline fill="none" stroke="#18706a" strokeWidth="2.4" points={polylinePoints(overlayMetricValues.baseline)} />
              <polyline fill="none" stroke="#9b6a13" strokeWidth="2.4" points={polylinePoints(overlayMetricValues.experiment)} />
              {evaluation.timeline.markers.map((marker, index) => {
                const x = evaluation.timeline.markers.length > 1
                  ? (index / (evaluation.timeline.markers.length - 1)) * 100
                  : 0;
                return (
                  <circle
                    key={`${marker.timestamp_utc}-${index}`}
                    cx={x}
                    cy={8}
                    r={1.2}
                    fill={marker.severity === 'critical' ? '#b33a3a' : marker.severity === 'warning' ? '#9b6a13' : '#18706a'}
                  />
                );
              })}
            </svg>
            <p className="muted-line">
              Baseline: {evaluation.definition.baseline_cohort_id} | Experiment: {evaluation.definition.experiment_cohort_id}
            </p>
          </>
        ) : (
          <p className="muted-line">No timeline yet.</p>
        )}
      </Panel>

      <Panel title="Evidence">
        {evaluation ? (
          <>
            <p className="muted-line">
              Correlation IDs: {evaluation.evidence.correlation_ids.length > 0 ? evaluation.evidence.correlation_ids.join(', ') : 'none'}
            </p>
            {evaluation.evidence.correlation_ids.length === 0 ? (
              <p className="muted-line">No decision traces were generated for this experiment window.</p>
            ) : null}
            <div className="cohort-row-actions">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/audit-traces?cohort=${encodeURIComponent(evaluation.definition.experiment_cohort_id)}${
                      evaluation.evidence.correlation_ids[0]
                        ? `&correlation_id=${encodeURIComponent(evaluation.evidence.correlation_ids[0])}`
                        : ''
                    }`
                  )
                }
              >
                Open cohort traces
              </button>
              <button
                type="button"
                onClick={() => navigate(`/machines?cohort=${encodeURIComponent(evaluation.definition.experiment_cohort_id)}`)}
              >
                Open machine list
              </button>
              <button
                type="button"
                disabled={evaluation.evidence.correlation_ids.length === 0}
                title={evaluation.evidence.correlation_ids.length === 0 ? 'No correlation IDs available' : 'Generate trace pack'}
              >
                Generate trace pack
              </button>
            </div>
            <h4>Experiment events</h4>
            <ul className="kv-list">
              {evaluation.events.slice(-10).map((event) => (
                <li key={event.event_id}>
                  <span>{event.type}</span>
                  <strong>{formatUtc(event.occurred_at_utc)} - {event.message}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted-line">No evidence yet.</p>
        )}
      </Panel>
    </div>
  );
}
