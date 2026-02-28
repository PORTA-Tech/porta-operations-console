import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { useCohortMetrics } from '../../hooks/useCohortMetrics';
import type { CohortSummary } from '../../api/cohorts';
import type { CohortId } from '../../types/apiContracts';
import { formatUtc } from '../../utils/date';

type DataLens = 'reliability' | 'behavioral';
type SortMode = 'worst_error_desc' | 'worst_p99_desc' | 'worst_degradation_desc' | 'name_asc';
type TrendMetric = 'error' | 'p99' | 'degradation';
type DeltaTone = 'critical' | 'warn' | 'ok' | 'neutral';
type ConfidenceLevel = 'low' | 'medium' | 'high';

interface CohortComputedRow {
  row: CohortSummary;
  deltaError: number;
  deltaP99: number;
  deltaDegradation: number;
  avgOverload: number;
  deltaOverload: number;
  avgFatigue: number;
  deltaFatigue: number;
  interventionsPerMin: number;
  policyDecisionsPerMin: number;
  configParts: Array<{ version: string; count: number; sharePct: number }>;
  configLabel: string;
  mixedConfig: boolean;
  confidence: ConfidenceLevel;
}

const cohortColorMap: Record<string, string> = {
  stable: '#18706a',
  experimental: '#b33a3a',
  'canary-1': '#9b6a13',
  'canary-5': '#7d4a2f',
  internal: '#365f7b'
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}%`;
}

function ms(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.round(value)}ms`;
}

function formatSigned(value: number, decimals = 3): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}`;
}

function deltaTonePercent(delta: number): DeltaTone {
  if (delta > 0.1) return 'critical';
  if (delta < -0.1) return 'ok';
  if (Math.abs(delta) <= 0.05) return 'neutral';
  return 'warn';
}

function deltaToneMs(delta: number): DeltaTone {
  if (delta > 20) return 'critical';
  if (delta < -20) return 'ok';
  if (Math.abs(delta) <= 10) return 'neutral';
  return 'warn';
}

function formatConfigDistribution(
  dist: Record<string, number>,
  nodeCount: number
): { label: string; mixed: boolean; parts: Array<{ version: string; count: number; sharePct: number }> } {
  const entries = Object.entries(dist).sort((left, right) => right[1] - left[1]);
  if (entries.length === 0) {
    return { label: 'n/a', mixed: false, parts: [] };
  }

  const effectiveTotal = nodeCount > 0
    ? nodeCount
    : entries.reduce((sum, [, count]) => sum + count, 0);
  const parts = entries.map(([version, count]) => {
    const share = effectiveTotal > 0 ? Math.round((count / effectiveTotal) * 100) : 0;
    return { version, count, sharePct: share };
  });
  return {
    label: parts.map((part) => `v${part.version} (${part.sharePct}%)`).join(', '),
    mixed: entries.length > 1,
    parts
  };
}

function buildTrendPolyline(values: number[], globalMin: number, globalMax: number, points: number): string {
  if (values.length === 0 || points <= 1) {
    return '';
  }

  const range = Math.max(1e-9, globalMax - globalMin);
  return values
    .map((value, index) => {
      const x = (index / (points - 1)) * 100;
      const y = 92 - ((value - globalMin) / range) * 84;
      return `${x},${y}`;
    })
    .join(' ');
}

function computeBehavioralMetrics(row: CohortSummary): {
  overload: number;
  fatigue: number;
  interventionsPerMin: number;
  policyDecisionsPerMin: number;
} {
  const overload = clamp(
    row.degradationRatePct * 22 + row.errorRatePct * 55 + (row.latencyP99Ms / 300) * 25,
    0,
    99
  );
  const fatigue = clamp(
    row.degradationRatePct * 18 + row.errorRatePct * 35 + (row.latencyP95Ms / 300) * 20,
    0,
    99
  );
  const interventionsPerMin = clamp(
    0.2 + row.degradationRatePct * 1.3 + row.errorRatePct * 1.4,
    0,
    12
  );
  const policyDecisionsPerMin = clamp(
    row.nodeCount * 0.04 + interventionsPerMin * 0.8,
    0,
    200
  );
  return {
    overload,
    fatigue,
    interventionsPerMin,
    policyDecisionsPerMin
  };
}

function computeConfidenceLevel(nodeCount: number): ConfidenceLevel {
  if (nodeCount >= 150) return 'high';
  if (nodeCount >= 40) return 'medium';
  return 'low';
}

function confidenceLabel(level: ConfidenceLevel): string {
  if (level === 'high') return 'High confidence';
  if (level === 'medium') return 'Medium confidence';
  return 'Low confidence';
}

export function CohortOverview() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const {
    rows,
    loading,
    error,
    window,
    secondaryCohort,
    setWindow,
    setSecondaryCohort
  } = useCohortMetrics();

  const [dataLens, setDataLens] = useState<DataLens>((params.get('lens') as DataLens) || 'reliability');
  const [sortMode, setSortMode] = useState<SortMode>((params.get('sort') as SortMode) || 'worst_error_desc');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>((params.get('trend') as TrendMetric) || 'error');
  const [normalizeTrend, setNormalizeTrend] = useState(params.get('normalize') === '1');
  const [hoverIndex, setHoverIndex] = useState<number | undefined>(undefined);
  const [hiddenCohorts, setHiddenCohorts] = useState<Record<string, boolean>>({});
  const [, setClockTick] = useState(0);

  useEffect(() => {
    const timer = globalThis.window.setInterval(() => {
      setClockTick((current) => current + 1);
    }, 1000);
    return () => globalThis.window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const queryWindow = params.get('window');
    if (queryWindow && queryWindow !== window) {
      setWindow(queryWindow as '15m' | '1h' | '6h' | '24h');
    }

    const queryBaseline = (params.get('baseline') || params.get('cohortB')) as CohortId | null;
    if (queryBaseline) {
      const exists = rows.some((row) => row.cohortId === queryBaseline);
      if (exists && queryBaseline !== secondaryCohort) {
        setSecondaryCohort(queryBaseline);
      }
    }
  }, [params, rows, secondaryCohort, setSecondaryCohort, setWindow, window]);

  const updateParam = (key: string, value: string, clearValue?: string) => {
    const next = new URLSearchParams(params);
    if (value === '' || (clearValue && value === clearValue)) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const baseline = useMemo(() => {
    const stable = rows.find((row) => row.cohortId === 'stable');
    return rows.find((row) => row.cohortId === secondaryCohort) ?? stable ?? rows[0];
  }, [rows, secondaryCohort]);

  const computedRows = useMemo<CohortComputedRow[]>(() => {
    if (!baseline) {
      return [];
    }

    return rows.map((row) => {
      const behavioral = computeBehavioralMetrics(row);
      const baselineBehavioral = computeBehavioralMetrics(baseline);
      const config = formatConfigDistribution(row.configSeqDistribution, row.nodeCount);
      return {
        row,
        deltaError: row.errorRatePct - baseline.errorRatePct,
        deltaP99: row.latencyP99Ms - baseline.latencyP99Ms,
        deltaDegradation: row.degradationRatePct - baseline.degradationRatePct,
        avgOverload: behavioral.overload,
        deltaOverload: behavioral.overload - baselineBehavioral.overload,
        avgFatigue: behavioral.fatigue,
        deltaFatigue: behavioral.fatigue - baselineBehavioral.fatigue,
        interventionsPerMin: behavioral.interventionsPerMin,
        policyDecisionsPerMin: behavioral.policyDecisionsPerMin,
        configParts: config.parts,
        configLabel: config.label,
        mixedConfig: config.mixed,
        confidence: computeConfidenceLevel(row.nodeCount)
      };
    });
  }, [baseline, rows]);

  const sortedRows = useMemo(() => {
    const next = [...computedRows];
    next.sort((left, right) => {
      if (sortMode === 'worst_error_desc') {
        return right.deltaError - left.deltaError;
      }
      if (sortMode === 'worst_p99_desc') {
        return right.deltaP99 - left.deltaP99;
      }
      if (sortMode === 'worst_degradation_desc') {
        return right.deltaDegradation - left.deltaDegradation;
      }
      return left.row.cohortId.localeCompare(right.row.cohortId);
    });
    return next;
  }, [computedRows, sortMode]);

  const insightBanner = useMemo(() => {
    const baselineName = baseline?.cohortId ?? 'stable';
    const significant = sortedRows.filter((item) =>
      item.row.cohortId !== baselineName
      && (item.deltaError > 0.1 || item.deltaP99 > 20 || item.deltaDegradation > 0.1)
    );

    if (significant.length === 0) {
      return {
        tone: 'ok' as const,
        message: 'No significant regression detected across cohorts.',
        primary: undefined as CohortComputedRow | undefined,
        secondary: undefined as CohortComputedRow | undefined
      };
    }

    const primary = significant[0]!;
    const secondary = significant[1];
    const secondaryText = secondary
      ? ` ${secondary.row.cohortId} also shows elevated error/latency.`
      : '';
    return {
      tone: 'warn' as const,
      message:
        `${primary.row.cohortId} is regressing vs ${baselineName} `
        + `(${pct(primary.deltaError)} errors, ${ms(primary.deltaP99)} P99).${secondaryText}`,
      primary,
      secondary
    };
  }, [baseline, sortedRows]);

  const topRegressions = useMemo(
    () => sortedRows.filter((item) => item.row.cohortId !== baseline?.cohortId).slice(0, 2),
    [baseline?.cohortId, sortedRows]
  );

  const versionCorrelationHint = useMemo(() => {
    const primary = insightBanner.primary;
    if (!primary || !primary.mixedConfig || primary.configParts.length <= 1) {
      return undefined;
    }
    const regressiveVersion = primary.configParts[1];
    if (!regressiveVersion || regressiveVersion.sharePct < 10) {
      return undefined;
    }
    return `Regression correlates with v${regressiveVersion.version} presence (${regressiveVersion.sharePct}% of nodes).`;
  }, [insightBanner.primary]);

  const visibleTrendRows = sortedRows.filter((item) => !hiddenCohorts[item.row.cohortId]);
  const trendPointCount = visibleTrendRows.reduce((max, item) => Math.max(max, item.row.trend.length), 0);
  const baselineTrendValues = baseline?.trend.map((point) => {
    if (trendMetric === 'p99') return point.p99LatencyMs;
    if (trendMetric === 'degradation') return point.degradationRatePct;
    return point.errorRatePct;
  }) ?? [];

  const trendSeries = visibleTrendRows.map((item) => {
    const rawValues = item.row.trend.map((point) => {
      if (trendMetric === 'p99') return point.p99LatencyMs;
      if (trendMetric === 'degradation') return point.degradationRatePct;
      return point.errorRatePct;
    });
    const values = normalizeTrend
      ? rawValues.map((value, index) => value - (baselineTrendValues[index] ?? 0))
      : rawValues;
    return {
      cohortId: item.row.cohortId,
      values,
      color: cohortColorMap[item.row.cohortId] ?? '#5e6f73',
      baseline: item.row.cohortId === baseline?.cohortId
    };
  });

  const allTrendValues = trendSeries.flatMap((series) => series.values);
  const trendMin = allTrendValues.length > 0 ? Math.min(...allTrendValues) : 0;
  const trendMax = allTrendValues.length > 0 ? Math.max(...allTrendValues) : 1;
  const clampedHoverIndex = typeof hoverIndex === 'number'
    ? clamp(hoverIndex, 0, Math.max(0, trendPointCount - 1))
    : undefined;
  const hoveredTimestamp = clampedHoverIndex !== undefined && visibleTrendRows[0]
    ? visibleTrendRows[0].row.trend[clampedHoverIndex]?.timestampUtc
    : undefined;

  return (
    <Panel title="Cohort Comparison">
      <div className={`cohort-insight-banner ${insightBanner.tone}`}>
        <strong>{insightBanner.tone === 'warn' ? 'Warning:' : 'OK:'}</strong> {insightBanner.message}
      </div>

      {insightBanner.primary ? (
        <section className="cohort-regression-module">
          <div className="cohort-regression-main">
            <h4>Regression Detected</h4>
            <p className="cohort-regression-name">{insightBanner.primary.row.cohortId}</p>
            <div className="cohort-regression-metrics">
              <div>
                <span className="muted-line">Delta Error</span>
                <strong className={`delta-chip ${deltaTonePercent(insightBanner.primary.deltaError)}`}>
                  {pct(insightBanner.primary.deltaError)}
                </strong>
              </div>
              <div>
                <span className="muted-line">Delta P99</span>
                <strong className={`delta-chip ${deltaToneMs(insightBanner.primary.deltaP99)}`}>
                  {ms(insightBanner.primary.deltaP99)}
                </strong>
              </div>
              <div>
                <span className="muted-line">Delta Degradation</span>
                <strong className={`delta-chip ${deltaTonePercent(insightBanner.primary.deltaDegradation)}`}>
                  {pct(insightBanner.primary.deltaDegradation)}
                </strong>
              </div>
              <div>
                <span className="muted-line">Confidence</span>
                <strong className={`delta-chip ${insightBanner.primary.confidence === 'high' ? 'ok' : insightBanner.primary.confidence === 'medium' ? 'warn' : 'neutral'}`}>
                  {confidenceLabel(insightBanner.primary.confidence)}
                </strong>
              </div>
            </div>
            <p className="muted-line">
              Compared to: {baseline?.cohortId ?? 'stable'} ({window} window)
            </p>
          </div>
          <div className="cohort-regression-actions">
            <button
              type="button"
              onClick={() => navigate(`/machines?cohort=${encodeURIComponent(insightBanner.primary!.row.cohortId)}`)}
            >
              Open Machines
            </button>
            <button
              type="button"
              onClick={() => navigate(`/audit-traces?cohort=${encodeURIComponent(insightBanner.primary!.row.cohortId)}`)}
            >
              View Traces
            </button>
            <button
              type="button"
              onClick={() => navigate(`/experiments?cohort=${encodeURIComponent(insightBanner.primary!.row.cohortId)}`)}
            >
              View Experiment
            </button>
          </div>
          {versionCorrelationHint ? (
            <p className="cohort-correlation-note">{versionCorrelationHint}</p>
          ) : null}
        </section>
      ) : null}

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
          Baseline cohort
          <select
            value={baseline?.cohortId ?? ''}
            onChange={(event) => {
              const selected = event.target.value as CohortId;
              setSecondaryCohort(selected);
              updateParam('baseline', selected, 'stable');
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
          Lens
          <select
            value={dataLens}
            onChange={(event) => {
              const next = event.target.value as DataLens;
              setDataLens(next);
              updateParam('lens', next, 'reliability');
            }}
          >
            <option value="reliability">Reliability</option>
            <option value="behavioral">Behavioral</option>
          </select>
        </label>
          <label>
            Sort
          <select
            value={sortMode}
            onChange={(event) => {
              const next = event.target.value as SortMode;
              setSortMode(next);
              updateParam('sort', next, 'worst_error_desc');
            }}
          >
            <option value="worst_error_desc">Worst Delta Error first</option>
            <option value="worst_p99_desc">Worst Delta P99 first</option>
            <option value="worst_degradation_desc">Worst Delta Degradation first</option>
            <option value="name_asc">Cohort name (A-Z)</option>
          </select>
          </label>
      </div>

      {topRegressions.length > 0 ? (
        <div className="cohort-highlight-grid">
          {topRegressions.map((item) => (
            <article key={item.row.cohortId} className="cohort-highlight-card">
              <header>
                <strong>{item.row.cohortId}</strong>
                <span className={`delta-chip ${item.confidence === 'high' ? 'ok' : item.confidence === 'medium' ? 'warn' : 'neutral'}`}>
                  {confidenceLabel(item.confidence)}
                </span>
              </header>
              <p>
                Error: {item.row.errorRatePct.toFixed(3)}% ({pct(item.deltaError)})
              </p>
              <p>
                P99: {item.row.latencyP99Ms}ms ({ms(item.deltaP99)})
              </p>
              <p>
                Degradation: {item.row.degradationRatePct.toFixed(3)}% ({pct(item.deltaDegradation)})
              </p>
              <p className="muted-line">
                {item.configLabel}
              </p>
            </article>
          ))}
        </div>
      ) : null}

      {loading ? <p className="muted-line">Loading cohort summaries...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      {!loading && !error ? (
        <table className="simple-table cohort-table">
          <thead>
            {dataLens === 'reliability' ? (
              <tr>
                <th>Cohort</th>
                <th>Machines</th>
                <th>Error %</th>
                <th>Delta Error</th>
                <th>P50</th>
                <th>P95</th>
                <th>P99</th>
                <th>Delta P99</th>
                <th>Degradation %</th>
                <th>Delta Degradation</th>
                <th>Config Versions</th>
                <th>Actions</th>
              </tr>
            ) : (
              <tr>
                <th>Cohort</th>
                <th>Machines</th>
                <th>Avg Overload</th>
                <th>Delta Overload</th>
                <th>Avg Fatigue</th>
                <th>Delta Fatigue</th>
                <th>Interventions/min</th>
                <th>Policy decisions/min</th>
                <th>Config Versions</th>
                <th>Actions</th>
              </tr>
            )}
          </thead>
          <tbody>
            {sortedRows.map((item) => (
              <tr key={item.row.cohortId} className={item.row.cohortId === baseline?.cohortId ? 'cohort-baseline-row' : undefined}>
                {dataLens === 'reliability' ? (
                  <>
                    <td>{item.row.cohortId}</td>
                    <td>{item.row.nodeCount}</td>
                    <td>{item.row.errorRatePct.toFixed(3)}%</td>
                    <td>
                      <span className={`delta-chip ${deltaTonePercent(item.deltaError)}`}>{pct(item.deltaError)}</span>
                    </td>
                    <td>{item.row.latencyP50Ms} ms</td>
                    <td>{item.row.latencyP95Ms} ms</td>
                    <td>{item.row.latencyP99Ms} ms</td>
                    <td>
                      <span className={`delta-chip ${deltaToneMs(item.deltaP99)}`}>{ms(item.deltaP99)}</span>
                    </td>
                    <td>{item.row.degradationRatePct.toFixed(3)}%</td>
                    <td>
                      <span className={`delta-chip ${deltaTonePercent(item.deltaDegradation)}`}>{pct(item.deltaDegradation)}</span>
                    </td>
                    <td>
                      <div className="config-dist-cell">
                        {item.mixedConfig ? <span className="delta-chip warn">Mixed</span> : null}
                        <div className="config-dist-bars">
                          {item.configParts.map((part) => (
                            <div key={`${item.row.cohortId}-${part.version}`} className="config-dist-row">
                              <span className="config-dist-label">v{part.version}</span>
                              <div className="config-dist-track">
                                <div className="config-dist-fill" style={{ width: `${part.sharePct}%` }} />
                              </div>
                              <span className="config-dist-value">{part.sharePct}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{item.row.cohortId}</td>
                    <td>{item.row.nodeCount}</td>
                    <td>{item.avgOverload.toFixed(1)}%</td>
                    <td>
                      <span className={`delta-chip ${deltaTonePercent(item.deltaOverload)}`}>{pct(item.deltaOverload)}</span>
                    </td>
                    <td>{item.avgFatigue.toFixed(1)}%</td>
                    <td>
                      <span className={`delta-chip ${deltaTonePercent(item.deltaFatigue)}`}>{pct(item.deltaFatigue)}</span>
                    </td>
                    <td>{item.interventionsPerMin.toFixed(2)}</td>
                    <td>{item.policyDecisionsPerMin.toFixed(1)}</td>
                    <td>
                      <div className="config-dist-cell">
                        {item.mixedConfig ? <span className="delta-chip warn">Mixed</span> : null}
                        <div className="config-dist-bars">
                          {item.configParts.map((part) => (
                            <div key={`${item.row.cohortId}-${part.version}`} className="config-dist-row">
                              <span className="config-dist-label">v{part.version}</span>
                              <div className="config-dist-track">
                                <div className="config-dist-fill" style={{ width: `${part.sharePct}%` }} />
                              </div>
                              <span className="config-dist-value">{part.sharePct}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </>
                )}
                <td>
                  <div className="cohort-row-actions">
                    <button type="button" onClick={() => navigate(`/machines?cohort=${encodeURIComponent(item.row.cohortId)}`)}>
                      View Machines
                    </button>
                    <button type="button" onClick={() => navigate(`/audit-traces?cohort=${encodeURIComponent(item.row.cohortId)}`)}>
                      Open Traces
                    </button>
                    <button type="button" onClick={() => navigate(`/config?cohort=${encodeURIComponent(item.row.cohortId)}`)}>
                      View Config
                    </button>
                    {item.row.cohortId === 'experimental' ? (
                      <>
                        <span className="delta-chip ok">Experiment</span>
                        <button type="button" onClick={() => navigate(`/experiments?cohort=${encodeURIComponent(item.row.cohortId)}`)}>
                          View Experiment
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div className="trend-panel">
        <div className="panel-heading-row">
          <h4>Cohort Trend</h4>
          <div className="cohort-trend-controls">
            <label>
              Trend metric
              <select
                value={trendMetric}
                onChange={(event) => {
                  const next = event.target.value as TrendMetric;
                  setTrendMetric(next);
                  updateParam('trend', next, 'error');
                }}
              >
                <option value="error">Error %</option>
                <option value="p99">P99 Latency</option>
                <option value="degradation">Degradation %</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={normalizeTrend}
                onChange={(event) => {
                  setNormalizeTrend(event.target.checked);
                  updateParam('normalize', event.target.checked ? '1' : '', '');
                }}
              />
              Normalize to baseline
            </label>
          </div>
        </div>

        <div className="cohort-trend-legend">
          {sortedRows.map((item) => {
            const hidden = Boolean(hiddenCohorts[item.row.cohortId]);
            const color = cohortColorMap[item.row.cohortId] ?? '#5e6f73';
            return (
              <label key={item.row.cohortId} className={`cohort-toggle ${hidden ? 'muted' : ''}`}>
                <input
                  type="checkbox"
                  checked={!hidden}
                  onChange={(event) => {
                    setHiddenCohorts((current) => ({
                      ...current,
                      [item.row.cohortId]: !event.target.checked
                    }));
                  }}
                />
                <span className="cohort-color-dot" style={{ background: color }} />
                <span className={item.row.cohortId === baseline?.cohortId ? 'cohort-baseline-label' : ''}>
                  {item.row.cohortId}
                </span>
              </label>
            );
          })}
        </div>

        <div
          className="cohort-trend-wrap"
          onMouseMove={(event) => {
            if (trendPointCount <= 1) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const ratio = clamp((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1);
            setHoverIndex(Math.round(ratio * (trendPointCount - 1)));
          }}
          onMouseLeave={() => setHoverIndex(undefined)}
        >
          <svg viewBox="0 0 100 100" className="trend-svg" role="img" aria-label="Cohort trends by cohort">
            {trendSeries.map((series) => (
              <polyline
                key={series.cohortId}
                fill="none"
                stroke={series.color}
                strokeWidth={series.baseline ? 3.2 : 2.2}
                opacity={series.baseline ? 1 : 0.85}
                points={buildTrendPolyline(series.values, trendMin, trendMax, trendPointCount)}
              />
            ))}
            {typeof clampedHoverIndex === 'number' && trendPointCount > 1 ? (
              <line
                x1={(clampedHoverIndex / (trendPointCount - 1)) * 100}
                x2={(clampedHoverIndex / (trendPointCount - 1)) * 100}
                y1={0}
                y2={100}
                stroke="#4d5f64"
                strokeDasharray="2,2"
                strokeWidth="0.5"
              />
            ) : null}
          </svg>
        </div>

        {typeof clampedHoverIndex === 'number' ? (
          <div className="cohort-hover-readout">
            <p className="muted-line">Point time: {formatUtc(hoveredTimestamp)}</p>
            <ul className="kv-list">
              {trendSeries.map((series) => {
                const value = series.values[clampedHoverIndex] ?? series.values[series.values.length - 1] ?? 0;
                const suffix = trendMetric === 'p99' ? 'ms' : '%';
                const renderedValue = trendMetric === 'p99'
                  ? `${normalizeTrend ? (value >= 0 ? '+' : '') : ''}${Math.round(value)}`
                  : `${normalizeTrend ? formatSigned(value, 3) : value.toFixed(3)}`;
                return (
                  <li key={series.cohortId}>
                    <span>{series.cohortId}</span>
                    <strong>{renderedValue} {suffix}</strong>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
