import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { useCohortMetrics } from '../../hooks/useCohortMetrics';
import type { CohortRegressionEvent, CohortSummary } from '../../api/cohorts';
import type { CohortId } from '../../types/apiContracts';
import { formatUtc } from '../../utils/date';

type DataLens = 'reliability' | 'behavioral';
type SortMode = 'worst_error_desc' | 'worst_p99_desc' | 'worst_degradation_desc' | 'name_asc';
type TrendMetric = 'error' | 'p99' | 'degradation';

const cohortColorMap: Record<string, string> = {
  stable: '#18706a',
  experimental: '#b33a3a',
  'canary-1': '#9b6a13',
  'canary-5': '#7d4a2f',
  internal: '#365f7b'
};

function pct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}%`;
}

function ms(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.round(value)}ms`;
}

function eventScore(event: CohortRegressionEvent): number {
  const threshold = Math.abs(event.threshold) > 0 ? Math.abs(event.threshold) : 1;
  const ratio = Math.abs(event.delta) / threshold;
  return ratio * (event.severity === 'critical' ? 2 : 1);
}

function eventLabel(event: CohortRegressionEvent): string {
  if (event.metric === 'p99_latency') return 'Latency regression';
  if (event.metric === 'error_rate') return 'Error-rate regression';
  return 'Degradation regression';
}

function trendValues(row: CohortSummary, metric: TrendMetric): number[] {
  return row.trend.map((point) => {
    if (metric === 'p99') return point.p99LatencyMs;
    if (metric === 'degradation') return point.degradationRatePct;
    return point.errorRatePct;
  });
}

function polylinePoints(values: number[], min: number, max: number): string {
  if (values.length === 0) return '';
  const range = Math.max(1e-9, max - min);
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 92 - ((value - min) / range) * 84;
      return `${x},${y}`;
    })
    .join(' ');
}

function confidenceLabel(level: CohortSummary['confidence']): string {
  if (level === 'high') return 'High';
  if (level === 'medium') return 'Medium';
  return 'Low';
}

function findPrimaryEvent(events: CohortRegressionEvent[], cohortId: CohortId): CohortRegressionEvent | undefined {
  return events
    .filter((event) => event.cohortId === cohortId)
    .sort((left, right) => eventScore(right) - eventScore(left))[0];
}

export function CohortOverview() {
  const navigate = useNavigate();
  const {
    snapshot,
    rows,
    generatedAtUtc,
    source,
    activeEvents,
    recentEvents,
    loading,
    error,
    window,
    secondaryCohort,
    setWindow,
    setSecondaryCohort
  } = useCohortMetrics();

  const [dataLens, setDataLens] = useState<DataLens>('reliability');
  const [sortMode, setSortMode] = useState<SortMode>('worst_error_desc');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('error');

  const baseline = useMemo(() => {
    const baselineId = snapshot?.baselineCohortId ?? secondaryCohort;
    return rows.find((row) => row.cohortId === baselineId) ?? rows.find((row) => row.cohortId === 'stable') ?? rows[0];
  }, [rows, secondaryCohort, snapshot?.baselineCohortId]);

  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((left, right) => {
      if (sortMode === 'worst_error_desc') return right.deltaErrorPct - left.deltaErrorPct;
      if (sortMode === 'worst_p99_desc') return right.deltaP99Ms - left.deltaP99Ms;
      if (sortMode === 'worst_degradation_desc') return right.deltaDegradationPct - left.deltaDegradationPct;
      return left.cohortId.localeCompare(right.cohortId);
    });
    return next;
  }, [rows, sortMode]);

  const primaryRow = useMemo(() => {
    return sortedRows
      .filter((row) => row.cohortId !== baseline?.cohortId)
      .map((row) => ({ row, event: findPrimaryEvent(activeEvents, row.cohortId) }))
      .filter((entry) => Boolean(entry.event))
      .sort((left, right) => eventScore(right.event!) - eventScore(left.event!))[0];
  }, [activeEvents, baseline?.cohortId, sortedRows]);

  const trendSeries = sortedRows.map((row) => ({
    cohortId: row.cohortId,
    values: trendValues(row, trendMetric),
    color: cohortColorMap[row.cohortId] ?? '#5e6f73'
  }));
  const allTrend = trendSeries.flatMap((series) => series.values);
  const trendMin = allTrend.length > 0 ? Math.min(...allTrend) : 0;
  const trendMax = allTrend.length > 0 ? Math.max(...allTrend) : 1;

  return (
    <Panel title="Cohort Comparison">
      <p className="muted-line">
        Data source: {source ?? 'unknown'} | Last evaluation: {formatUtc(generatedAtUtc)} | Active events: {activeEvents.length}
      </p>

      <div className={`cohort-insight-banner ${primaryRow?.event?.severity === 'critical' ? 'critical' : primaryRow ? 'warn' : 'ok'}`}>
        <strong>{primaryRow ? (primaryRow.event!.severity === 'critical' ? 'Critical:' : 'Warning:') : 'OK:'}</strong>{' '}
        {primaryRow ? `${primaryRow.row.cohortId} regressed vs ${baseline?.cohortId ?? 'stable'}. ${primaryRow.event!.reason}` : 'No active cohort regression events.'}
      </div>

      <div className="cohort-controls">
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
          <select value={baseline?.cohortId ?? ''} onChange={(event) => setSecondaryCohort(event.target.value as CohortId)}>
            {rows.map((row) => (
              <option key={row.cohortId} value={row.cohortId}>{row.cohortId}</option>
            ))}
          </select>
        </label>
        <label>
          Lens
          <select value={dataLens} onChange={(event) => setDataLens(event.target.value as DataLens)}>
            <option value="reliability">Reliability</option>
            <option value="behavioral">Behavioral</option>
          </select>
        </label>
        <label>
          Sort
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="worst_error_desc">Worst Delta Error first</option>
            <option value="worst_p99_desc">Worst Delta P99 first</option>
            <option value="worst_degradation_desc">Worst Delta Degradation first</option>
            <option value="name_asc">Cohort name (A-Z)</option>
          </select>
        </label>
      </div>

      {loading ? <p className="muted-line">Loading cohort summaries...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      {!loading && !error ? (
        <table className="simple-table cohort-table">
          <thead>
            {dataLens === 'reliability' ? (
              <tr>
                <th>Cohort</th><th>Machines</th><th>Error %</th><th>Delta Error</th><th>P50</th><th>P95</th><th>P99</th><th>Delta P99</th><th>Degradation %</th><th>Delta Degradation</th><th>Trigger</th><th>Actions</th>
              </tr>
            ) : (
              <tr>
                <th>Cohort</th><th>Machines</th><th>Confidence</th><th>Active Triggers</th><th>Actions</th>
              </tr>
            )}
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const event = findPrimaryEvent(activeEvents, row.cohortId);
              return (
                <tr key={row.cohortId} className={row.cohortId === baseline?.cohortId ? 'cohort-baseline-row' : undefined}>
                  {dataLens === 'reliability' ? (
                    <>
                      <td>{row.cohortId}</td>
                      <td>{row.nodeCount}</td>
                      <td>{row.errorRatePct.toFixed(3)}%</td>
                      <td>{pct(row.deltaErrorPct)}</td>
                      <td>{row.latencyP50Ms} ms</td>
                      <td>{row.latencyP95Ms} ms</td>
                      <td>{row.latencyP99Ms} ms</td>
                      <td>{ms(row.deltaP99Ms)}</td>
                      <td>{row.degradationRatePct.toFixed(3)}%</td>
                      <td>{pct(row.deltaDegradationPct)}</td>
                      <td>{event ? `${eventLabel(event)} (${event.severity})` : 'None'}</td>
                      <td>
                        <button type="button" onClick={() => navigate(`/audit-traces?cohort=${encodeURIComponent(row.cohortId)}${event ? `&correlation_id=${encodeURIComponent(event.correlationId)}` : ''}`)}>Open Traces</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{row.cohortId}</td>
                      <td>{row.nodeCount}</td>
                      <td>{confidenceLabel(row.confidence)}</td>
                      <td>{row.activeEventCount}</td>
                      <td>
                        <button type="button" onClick={() => navigate(`/machines?cohort=${encodeURIComponent(row.cohortId)}`)}>View Machines</button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      <div className="trend-panel">
        <div className="panel-heading-row">
          <h4>Cohort Trend</h4>
          <label>
            Trend metric
            <select value={trendMetric} onChange={(event) => setTrendMetric(event.target.value as TrendMetric)}>
              <option value="error">Error %</option>
              <option value="p99">P99 Latency</option>
              <option value="degradation">Degradation %</option>
            </select>
          </label>
        </div>
        {trendSeries.length === 0 ? (
          <p className="muted-line">No timeline data yet. Waiting for cohort snapshots.</p>
        ) : (
          <svg viewBox="0 0 100 100" className="trend-svg" role="img" aria-label="Cohort trends">
            {trendSeries.map((series) => (
              <polyline key={series.cohortId} fill="none" stroke={series.color} strokeWidth={2.2} points={polylinePoints(series.values, trendMin, trendMax)} />
            ))}
            {recentEvents.filter((event) => event.window === window).slice(0, 40).map((event, index) => {
              const series = trendSeries.find((row) => row.cohortId === event.cohortId);
              const refRow = rows.find((row) => row.cohortId === event.cohortId);
              if (!series || !refRow || refRow.trend.length < 2) return null;
              const times = refRow.trend.map((point) => point.timestampUtc);
              const markerIndex = times.findIndex((t) => Date.parse(t) >= Date.parse(event.triggeredAtUtc));
              const i = markerIndex >= 0 ? markerIndex : times.length - 1;
              const x = (i / Math.max(1, times.length - 1)) * 100;
              const yValue = series.values[i] ?? series.values[series.values.length - 1] ?? 0;
              const y = 92 - ((yValue - trendMin) / Math.max(1e-9, trendMax - trendMin)) * 84;
              return <circle key={`${event.eventId}-${index}`} cx={x} cy={y} r={1.2} fill={event.severity === 'critical' ? '#b33a3a' : '#9b6a13'} />;
            })}
          </svg>
        )}
      </div>
    </Panel>
  );
}
