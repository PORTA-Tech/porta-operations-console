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

function formatPct(value: number | null, withSign = false): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `${withSign ? (value >= 0 ? '+' : '') : ''}${value.toFixed(3)}%`;
}

function formatMs(value: number | null, withSign = false): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `${withSign ? (value >= 0 ? '+' : '') : ''}${Math.round(value)}ms`;
}

function eventScore(event: CohortRegressionEvent): number {
  const severityWeight = event.severity === 'critical' ? 2 : 1;
  return severityWeight * 1_000_000_000 + Date.parse(event.triggeredAtUtc);
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

function sortableValue(value: number | null): number {
  return value === null ? Number.NEGATIVE_INFINITY : value;
}

function findPrimaryEvent(events: CohortRegressionEvent[], cohortId: CohortId): CohortRegressionEvent | undefined {
  return events
    .filter((event) => event.cohortId === cohortId)
    .sort((left, right) => eventScore(right) - eventScore(left))[0];
}

function metricEvent(event: CohortRegressionEvent | undefined, metric: CohortRegressionEvent['metric']): CohortRegressionEvent | undefined {
  if (!event) return undefined;
  return event.metric === metric ? event : undefined;
}

function eventChipTone(event: CohortRegressionEvent | undefined): 'critical' | 'warn' | 'neutral' {
  if (!event) return 'neutral';
  return event.severity === 'critical' ? 'critical' : 'warn';
}

export function CohortOverview() {
  const navigate = useNavigate();
  const {
    snapshot,
    dataQuality,
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
  const [selectedTrendEventId, setSelectedTrendEventId] = useState<string | undefined>();

  const baseline = useMemo(() => {
    const baselineId = snapshot?.baselineCohortId ?? secondaryCohort;
    return rows.find((row) => row.cohortId === baselineId) ?? rows.find((row) => row.cohortId === 'stable') ?? rows[0];
  }, [rows, secondaryCohort, snapshot?.baselineCohortId]);

  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((left, right) => {
      if (sortMode === 'worst_error_desc') return sortableValue(right.rawDeltaErrorPct) - sortableValue(left.rawDeltaErrorPct);
      if (sortMode === 'worst_p99_desc') return sortableValue(right.rawDeltaP99Ms) - sortableValue(left.rawDeltaP99Ms);
      if (sortMode === 'worst_degradation_desc') return sortableValue(right.rawDeltaDegradationPct) - sortableValue(left.rawDeltaDegradationPct);
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

  const trendMarkers = useMemo(() => {
    return recentEvents
      .filter((event) => event.window === window)
      .slice(0, 40)
      .map((event) => {
        const series = trendSeries.find((row) => row.cohortId === event.cohortId);
        const refRow = rows.find((row) => row.cohortId === event.cohortId);
        if (!series || !refRow || refRow.trend.length < 2) return undefined;
        const times = refRow.trend.map((point) => point.timestampUtc);
        const markerIndex = times.findIndex((t) => Date.parse(t) >= Date.parse(event.triggeredAtUtc));
        const i = markerIndex >= 0 ? markerIndex : times.length - 1;
        const x = (i / Math.max(1, times.length - 1)) * 100;
        const yValue = series.values[i] ?? series.values[series.values.length - 1] ?? 0;
        const y = 92 - ((yValue - trendMin) / Math.max(1e-9, trendMax - trendMin)) * 84;
        return { event, x, y };
      })
      .filter((marker): marker is { event: CohortRegressionEvent; x: number; y: number } => Boolean(marker));
  }, [recentEvents, rows, trendMax, trendMin, trendSeries, window]);

  const selectedTrendEvent = useMemo(() => {
    if (trendMarkers.length === 0) return undefined;
    if (!selectedTrendEventId) return trendMarkers[0];
    return trendMarkers.find((marker) => marker.event.eventId === selectedTrendEventId) ?? trendMarkers[0];
  }, [selectedTrendEventId, trendMarkers]);

  return (
    <Panel title="Cohort Comparison">
      <p className="muted-line">
        Data source: {source ?? 'unknown'} | Last evaluation: {formatUtc(generatedAtUtc)} | Active events: {activeEvents.length}
      </p>

      {primaryRow ? (
        <div className={`cohort-insight-banner ${primaryRow.event!.severity === 'critical' ? 'critical' : 'warn'}`}>
          <strong>{primaryRow.event!.severity === 'critical' ? 'Critical:' : 'Warning:'}</strong>{' '}
          {primaryRow.row.cohortId} regressed vs {primaryRow.event!.baselineCohortId}. {primaryRow.event!.reason}
          <br />
          <span className="muted-line">
            Trigger: {eventLabel(primaryRow.event!)} | Delta {primaryRow.event!.metric === 'p99_latency'
              ? formatMs(primaryRow.event!.delta, true)
              : formatPct(primaryRow.event!.delta, true)} | Threshold {primaryRow.event!.metric === 'p99_latency'
              ? formatMs(primaryRow.event!.threshold, true)
              : formatPct(primaryRow.event!.threshold, true)} | Confidence {primaryRow.event!.confidence} | Triggered {formatUtc(primaryRow.event!.triggeredAtUtc)}
          </span>
        </div>
      ) : (
        <div className="cohort-insight-banner ok">
          <strong>OK:</strong> No active cohort regression events.
        </div>
      )}

      {dataQuality ? (
        <>
          <div className="machines-data-banner">
            <span>
              Min sample: <strong>{dataQuality.minSampleMachines ?? 'n/a'}</strong>
            </span>
            <span>
              Min coverage: <strong>{dataQuality.minCoveragePct === null ? 'n/a' : `${dataQuality.minCoveragePct.toFixed(1)}%`}</strong>
            </span>
            <span>
              Freshness: <strong>{dataQuality.freshnessSeconds === null ? 'n/a' : `${dataQuality.freshnessSeconds}s`}</strong>
            </span>
            <span>
              Stream: <strong>{dataQuality.wsStreamOk === null ? 'unknown' : dataQuality.wsStreamOk ? 'Live' : 'Disconnected'}</strong>
            </span>
          </div>
          {dataQuality.valid === false ? (
            <p className="focus-banner">Not enough data to evaluate cohorts: {dataQuality.messages.join(' ')}</p>
          ) : null}
        </>
      ) : (
        <p className="muted-line">Data quality metadata unavailable from backend evaluator.</p>
      )}

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
              const errorEvent = metricEvent(event, 'error_rate');
              const p99Event = metricEvent(event, 'p99_latency');
              const degradationEvent = metricEvent(event, 'degradation_rate');
              const rowEventCount = activeEvents.filter((candidate) => candidate.cohortId === row.cohortId).length;
              const rowClass = [
                row.cohortId === baseline?.cohortId ? 'cohort-baseline-row' : '',
                event?.severity === 'critical' ? 'cohort-event-row-critical' : '',
                event?.severity === 'warning' ? 'cohort-event-row-warn' : ''
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <tr key={row.cohortId} className={rowClass || undefined}>
                  {dataLens === 'reliability' ? (
                    <>
                      <td>{row.cohortId}</td>
                      <td>{row.nodeCount}</td>
                      <td>{row.metricsAvailable ? formatPct(row.rawErrorRatePct) : 'n/a'}</td>
                      <td>
                        <span className={`delta-chip ${eventChipTone(errorEvent)}`}>
                          {row.metricsAvailable ? formatPct(row.rawDeltaErrorPct, true) : 'n/a'}
                        </span>
                      </td>
                      <td>{row.metricsAvailable ? formatMs(row.rawLatencyP50Ms) : 'n/a'}</td>
                      <td>{row.metricsAvailable ? formatMs(row.rawLatencyP95Ms) : 'n/a'}</td>
                      <td>{row.metricsAvailable ? formatMs(row.rawLatencyP99Ms) : 'n/a'}</td>
                      <td>
                        <span className={`delta-chip ${eventChipTone(p99Event)}`}>
                          {row.metricsAvailable ? formatMs(row.rawDeltaP99Ms, true) : 'n/a'}
                        </span>
                      </td>
                      <td>{row.metricsAvailable ? formatPct(row.rawDegradationRatePct) : 'n/a'}</td>
                      <td>
                        <span className={`delta-chip ${eventChipTone(degradationEvent)}`}>
                          {row.metricsAvailable ? formatPct(row.rawDeltaDegradationPct, true) : 'n/a'}
                        </span>
                      </td>
                      <td>{event ? `${eventLabel(event)} (${event.severity})` : 'No active event'}</td>
                      <td>
                        <div className="cohort-row-actions">
                          <button
                            type="button"
                            disabled={!event}
                            onClick={() =>
                              navigate(
                                `/audit-traces?cohort=${encodeURIComponent(row.cohortId)}${
                                  event?.correlationId ? `&correlation_id=${encodeURIComponent(event.correlationId)}` : ''
                                }`
                              )
                            }
                          >
                            Open Traces
                          </button>
                          <button type="button" onClick={() => navigate(`/machines?cohort=${encodeURIComponent(row.cohortId)}`)}>
                            View Machines
                          </button>
                        </div>
                        {!row.metricsAvailable ? (
                          <p className="muted-line">{row.availabilityReasonCode ?? 'Metrics unavailable for this cohort in current window.'}</p>
                        ) : null}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{row.cohortId}</td>
                      <td>{row.nodeCount}</td>
                      <td>{confidenceLabel(row.confidence)}</td>
                      <td>{rowEventCount}</td>
                      <td>
                        <div className="cohort-row-actions">
                          <button type="button" onClick={() => navigate(`/machines?cohort=${encodeURIComponent(row.cohortId)}`)}>View Machines</button>
                          <button
                            type="button"
                            disabled={!event}
                            onClick={() =>
                              navigate(
                                `/audit-traces?cohort=${encodeURIComponent(row.cohortId)}${
                                  event?.correlationId ? `&correlation_id=${encodeURIComponent(event.correlationId)}` : ''
                                }`
                              )
                            }
                          >
                            Open Traces
                          </button>
                        </div>
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
            {trendMarkers.map((marker) => (
              <circle
                key={marker.event.eventId}
                cx={marker.x}
                cy={marker.y}
                r={selectedTrendEvent?.event.eventId === marker.event.eventId ? 1.8 : 1.2}
                fill={marker.event.severity === 'critical' ? '#b33a3a' : '#9b6a13'}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedTrendEventId(marker.event.eventId)}
              />
            ))}
          </svg>
        )}
        {selectedTrendEvent ? (
          <div className="cohort-hover-readout">
            <p className="muted-line">
              Marker: {selectedTrendEvent.event.cohortId} | {eventLabel(selectedTrendEvent.event)} | {formatUtc(selectedTrendEvent.event.triggeredAtUtc)} | {selectedTrendEvent.event.severity}
            </p>
            <p className="muted-line">
              Correlation ID: {selectedTrendEvent.event.correlationId || 'none'}
            </p>
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/audit-traces?cohort=${encodeURIComponent(selectedTrendEvent.event.cohortId)}${
                    selectedTrendEvent.event.correlationId
                      ? `&correlation_id=${encodeURIComponent(selectedTrendEvent.event.correlationId)}`
                      : ''
                  }`
                )
              }
            >
              Open trace context
            </button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
