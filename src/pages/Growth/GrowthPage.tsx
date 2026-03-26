import { useEffect, useMemo, useState } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { SummaryBand } from '../../components/Layout/SummaryBand';
import { useGrowthDashboard } from '../../hooks/useGrowthDashboard';
import type {
  GrowthCohortRow,
  GrowthCohortWindow,
  GrowthSeries,
  GrowthSeriesMetric,
  GrowthUserJourneyEvent
} from '../../api/growth';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

type CohortFocus = {
  cohortDate: string;
  day: number;
};

const percentFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const integerFormatter = new Intl.NumberFormat(undefined);

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  return `${percentFormatter.format(value)}%`;
}

function formatCount(value: number): string {
  return integerFormatter.format(value);
}

function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatShortDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function metricLabel(metric: GrowthSeriesMetric): string {
  if (metric === 'registrations') return 'Registrations';
  if (metric === 'activations') return 'Activations';
  return 'Active Users';
}

function metricSubtitle(metric: GrowthSeriesMetric): string {
  if (metric === 'registrations') return 'Daily new user accounts from the control plane registration facts.';
  if (metric === 'activations') return 'Daily first-time activations after membership, device, consent, and activity all exist.';
  return 'Daily active users from account-active-day facts, not machine snapshots.';
}

function metricTone(metric: GrowthSeriesMetric): 'ok' | 'focus' | 'warn' | 'neutral' {
  if (metric === 'registrations') return 'ok';
  if (metric === 'activations') return 'focus';
  if (metric === 'active_users') return 'warn';
  return 'neutral';
}

function seriesHeadlineValue(series: GrowthSeries): number {
  if (series.metric === 'active_users') {
    return series.points[series.points.length - 1]?.value ?? 0;
  }

  return series.points.reduce((total, point) => total + point.value, 0);
}

function bucketLabel(series: GrowthSeries, index: number): string {
  const point = series.points[index];
  if (!point) {
    return 'No bucket selected';
  }

  if (series.interval === 'day') {
    return formatShortDate(point.bucketStartUtc);
  }

  return `${formatShortDate(point.bucketStartUtc)} - ${formatShortDate(point.bucketEndUtc)}`;
}

function eventLabel(event: GrowthUserJourneyEvent['eventType']): string {
  return event
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function describeJourneyEvent(event: GrowthUserJourneyEvent): string {
  const segments: string[] = [];
  if (event.activityDate) segments.push(`activity date ${event.activityDate}`);
  if (event.deviceId) segments.push(`device ${event.deviceId}`);
  if (event.orgId) segments.push(`workspace ${event.orgId}`);
  if (event.machineId) segments.push(`machine ${event.machineId}`);

  if (event.metadata && Object.keys(event.metadata).length > 0) {
    segments.push(
      Object.entries(event.metadata)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(', ')
    );
  }

  return segments.length > 0 ? segments.join(' | ') : 'No extra payload';
}

function resolveDefaultCohortFocus(rows: GrowthCohortRow[]): CohortFocus | null {
  const latestRow = rows[rows.length - 1] ?? null;
  if (!latestRow) {
    return null;
  }

  const preferred = latestRow.windows.find((window) => window.day === 7 && window.retentionRatePct !== null)
    ?? latestRow.windows.find((window) => window.day === 1 && window.retentionRatePct !== null)
    ?? latestRow.windows[0]
    ?? null;

  return preferred ? { cohortDate: latestRow.cohortDate, day: preferred.day } : null;
}

function MetricChartCard({ series }: { series: GrowthSeries }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const maxValue = Math.max(1, ...series.points.map((point) => point.value));

  useEffect(() => {
    setSelectedIndex(Math.max(0, series.points.length - 1));
  }, [series.metric, series.points.length]);

  const selectedPoint = series.points[selectedIndex] ?? null;
  const headlineValue = seriesHeadlineValue(series);
  const tone = metricTone(series.metric);

  return (
    <article className="growth-chart-card">
      <div className="growth-chart-header">
        <div className="growth-chart-copy">
          <p className="detail-section-kicker">{metricLabel(series.metric)}</p>
          <h3 className="growth-chart-title">{formatCount(headlineValue)}</h3>
          <p className="detail-section-copy">{metricSubtitle(series.metric)}</p>
        </div>
        <span className={`status-badge ${tone}`}>
          {series.metric === 'active_users' ? 'Latest bucket' : 'Window total'}
        </span>
      </div>

      {series.points.length === 0 ? (
        <div className="empty-state">
          <p className="muted-line">No buckets are available for this metric yet.</p>
        </div>
      ) : (
        <>
          <div className="growth-bar-chart" role="list" aria-label={`${metricLabel(series.metric)} chart`}>
            {series.points.map((point, index) => {
              const heightPct = point.value === 0 ? 4 : Math.max(14, Math.round((point.value / maxValue) * 100));
              const selected = index === selectedIndex;

              return (
                <button
                  key={`${series.metric}:${point.bucketStartUtc}`}
                  type="button"
                  className={selected ? 'growth-bar active' : 'growth-bar'}
                  onClick={() => setSelectedIndex(index)}
                  title={`${bucketLabel(series, index)} • ${point.value}`}
                >
                  <span className="growth-bar-track">
                    <span className="growth-bar-fill" style={{ height: `${heightPct}%` }} />
                  </span>
                  <span className="growth-bar-label">{formatShortDate(point.bucketStartUtc)}</span>
                </button>
              );
            })}
          </div>

          <div className="growth-chart-selection">
            <div>
              <span className="operations-field-label">Selected bucket</span>
              <strong>{selectedPoint ? bucketLabel(series, selectedIndex) : 'No bucket selected'}</strong>
            </div>
            <div>
              <span className="operations-field-label">Exact count</span>
              <strong>{selectedPoint ? formatCount(selectedPoint.value) : 'n/a'}</strong>
            </div>
            <div>
              <span className="operations-field-label">Bucket end</span>
              <strong>{selectedPoint ? formatShortDateTime(selectedPoint.bucketEndUtc) : 'n/a'}</strong>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

export function GrowthPage() {
  const {
    loading,
    refreshing,
    error,
    summary,
    seriesByMetric,
    cohorts,
    lastRefreshUtc,
    journey,
    journeyLoading,
    journeyError,
    loadJourney,
    clearJourney,
    refresh
  } = useGrowthDashboard();
  const [journeyAccountId, setJourneyAccountId] = useState('');
  const [cohortFocus, setCohortFocus] = useState<CohortFocus | null>(null);

  useEffect(() => {
    if (cohortFocus || !cohorts || cohorts.rows.length === 0) {
      return;
    }

    setCohortFocus(resolveDefaultCohortFocus(cohorts.rows));
  }, [cohortFocus, cohorts]);

  const selectedCohortRow = useMemo(
    () => cohorts?.rows.find((row) => row.cohortDate === cohortFocus?.cohortDate) ?? null,
    [cohortFocus, cohorts]
  );

  const selectedCohortWindow = useMemo<GrowthCohortWindow | null>(
    () => selectedCohortRow?.windows.find((window) => window.day === cohortFocus?.day) ?? null,
    [cohortFocus, selectedCohortRow]
  );

  async function handleJourneySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadJourney(journeyAccountId);
  }

  const summaryItems = summary
    ? [
      {
        label: 'Registered users',
        value: formatCount(summary.totalRegisteredUsers),
        meta: `Generated ${formatRelativeFromNow(summary.generatedAtUtc)}`,
        tone: 'neutral' as const
      },
      {
        label: 'New users (30d)',
        value: formatCount(summary.newRegisteredUsers),
        meta: `${formatShortDate(summary.windowStartUtc)} to ${formatShortDate(summary.windowEndUtc)}`,
        tone: 'ok' as const
      },
      {
        label: 'Activated users (30d)',
        value: formatCount(summary.activatedUsers),
        meta: summary.activationRatePct === null ? 'Awaiting cohort denominator' : `${formatPercent(summary.activationRatePct)} activation`,
        tone: 'focus' as const
      },
      {
        label: 'Retention D1',
        value: formatPercent(summary.retentionRateD1Pct),
        meta: summary.retentionRateD1Pct === null ? 'Not enough activity history yet' : `${formatPercent(summary.churnRateD1Pct)} churn`,
        tone: summary.retentionRateD1Pct === null ? 'neutral' as const : 'ok' as const
      },
      {
        label: 'Retention D7',
        value: formatPercent(summary.retentionRateD7Pct),
        meta: summary.retentionRateD7Pct === null ? 'Waiting for seven-day maturity' : `${formatPercent(summary.churnRateD7Pct)} churn`,
        tone: summary.retentionRateD7Pct === null ? 'neutral' as const : 'warn' as const
      },
      {
        label: 'Retention D30',
        value: formatPercent(summary.retentionRateD30Pct),
        meta: summary.retentionRateD30Pct === null ? 'Thirty-day history not mature yet' : `${formatPercent(summary.churnRateD30Pct)} churn`,
        tone: summary.retentionRateD30Pct === null ? 'neutral' as const : 'critical' as const
      }
    ]
    : [];

  const chartSeries = [
    seriesByMetric.registrations,
    seriesByMetric.activations,
    seriesByMetric.active_users
  ].filter((value): value is GrowthSeries => Boolean(value));

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading growth facts from the control plane...</p> : null}
      {refreshing && !loading ? <p className="muted-line">Refreshing growth facts…</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      {summary ? (
        <SummaryBand
          title="Sticky engine of growth"
          subtitle="Real registration, activation, retention, and churn computed from growth facts and account-active-day history."
          items={summaryItems}
        />
      ) : (
        <Panel
          title="Growth metrics"
          subtitle="The dashboard will populate once the control plane returns the growth summary payload."
        >
          <div className="empty-state">
            <p className="muted-line">No growth summary is available yet.</p>
          </div>
        </Panel>
      )}

      <Panel
        title="Trend charts"
        subtitle="Daily evolution for registrations, activations, and active users. Each bar is clickable for exact bucket counts."
      >
        {chartSeries.length === 0 ? (
          <div className="empty-state">
            <p className="muted-line">No growth series are available yet.</p>
          </div>
        ) : (
          <div className="growth-chart-grid">
            {chartSeries.map((series) => (
              <MetricChartCard key={series.metric} series={series} />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Cohort retention"
        subtitle="Retention and churn are driven only by account-active-day facts. Cells stay unavailable until the cohort window is mature."
      >
        {!cohorts || cohorts.rows.length === 0 ? (
          <div className="empty-state">
            <p className="muted-line">No cohort rows are available yet.</p>
          </div>
        ) : (
          <div className="growth-cohort-layout">
            <div className="table-scroll-wrap">
              <table className="simple-table growth-cohort-table">
                <thead>
                  <tr>
                    <th>Cohort date</th>
                    <th>Registered</th>
                    <th>Activated</th>
                    <th>D1 retention</th>
                    <th>D7 retention</th>
                    <th>D30 retention</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.rows.map((row) => (
                    <tr key={row.cohortDate}>
                      <td>
                        <div className="identity-stack">
                          <strong>{row.cohortDate}</strong>
                          <span className="identity-subline">
                            {formatShortDate(`${row.cohortDate}T00:00:00.000Z`)}
                          </span>
                        </div>
                      </td>
                      <td>{formatCount(row.registeredUsers)}</td>
                      <td>{formatCount(row.activatedUsers)}</td>
                      {[1, 7, 30].map((day) => {
                        const window = row.windows.find((entry) => entry.day === day) ?? null;
                        const selected = cohortFocus?.cohortDate === row.cohortDate && cohortFocus.day === day;

                        return (
                          <td key={`${row.cohortDate}:${day}`}>
                            <button
                              type="button"
                              className={selected ? 'growth-cohort-button active' : 'growth-cohort-button'}
                              onClick={() => setCohortFocus({ cohortDate: row.cohortDate, day })}
                            >
                              <strong>{formatPercent(window?.retentionRatePct ?? null)}</strong>
                              <span>
                                {window?.retainedUsers ?? 0} / {window?.eligibleUsers ?? 0}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="growth-cohort-focus">
              <p className="detail-section-kicker">Selected cohort window</p>
              {selectedCohortRow && selectedCohortWindow ? (
                <div className="operations-layer-grid compact">
                  <div className="operations-field">
                    <span className="operations-field-label">Cohort</span>
                    <strong>{selectedCohortRow.cohortDate}</strong>
                  </div>
                  <div className="operations-field">
                    <span className="operations-field-label">Window</span>
                    <strong>Day {selectedCohortWindow.day}</strong>
                  </div>
                  <div className="operations-field">
                    <span className="operations-field-label">Target date</span>
                    <strong>{formatShortDate(`${selectedCohortRow.cohortDate}T00:00:00.000Z`)}</strong>
                    <span className="identity-subline">+ {selectedCohortWindow.day} days</span>
                  </div>
                  <div className="operations-field">
                    <span className="operations-field-label">Eligible users</span>
                    <strong>{formatCount(selectedCohortWindow.eligibleUsers)}</strong>
                  </div>
                  <div className="operations-field">
                    <span className="operations-field-label">Retained users</span>
                    <strong>{formatCount(selectedCohortWindow.retainedUsers)}</strong>
                  </div>
                  <div className="operations-field">
                    <span className="operations-field-label">Churned users</span>
                    <strong>{formatCount(selectedCohortWindow.churnedUsers)}</strong>
                  </div>
                  <div className="operations-field">
                    <span className="operations-field-label">Retention</span>
                    <strong>{formatPercent(selectedCohortWindow.retentionRatePct)}</strong>
                  </div>
                  <div className="operations-field">
                    <span className="operations-field-label">Churn</span>
                    <strong>{formatPercent(selectedCohortWindow.churnRatePct)}</strong>
                  </div>
                  <div className="operations-field">
                    <span className="operations-field-label">Registered / activated</span>
                    <strong>{formatCount(selectedCohortRow.registeredUsers)} / {formatCount(selectedCohortRow.activatedUsers)}</strong>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p className="muted-line">Click a cohort cell to inspect the exact retention window.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="User journey drilldown"
        subtitle="Load a single account journey from the growth API. This page uses only growth endpoints, so journey lookup is direct by account ID for now."
      >
        <div className="growth-drilldown-shell">
          <form className="growth-journey-form" onSubmit={handleJourneySubmit}>
            <label>
              <span className="operations-field-label">Account ID</span>
              <input
                type="text"
                value={journeyAccountId}
                onChange={(event) => setJourneyAccountId(event.target.value)}
                placeholder="Paste an account UUID"
              />
            </label>
            <div className="growth-journey-actions">
              <button type="submit" disabled={journeyLoading || journeyAccountId.trim().length === 0}>
                {journeyLoading ? 'Loading journey…' : 'Load journey'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setJourneyAccountId('');
                  clearJourney();
                }}
                disabled={journeyLoading && !journey}
              >
                Clear
              </button>
              <button type="button" onClick={() => void refresh()} disabled={refreshing}>
                {refreshing ? 'Refreshing…' : 'Refresh growth data'}
              </button>
            </div>
          </form>

          {lastRefreshUtc ? (
            <p className="muted-line">Dashboard refreshed {formatRelativeFromNow(lastRefreshUtc)}.</p>
          ) : null}
          {journeyError ? <p className="error-line">{journeyError.code}: {journeyError.message}</p> : null}

          {journey ? (
            <div className="growth-journey-layout">
              <div className="operations-layer-grid compact">
                <div className="operations-field">
                  <span className="operations-field-label">Account</span>
                  <strong>{journey.accountId}</strong>
                </div>
                <div className="operations-field">
                  <span className="operations-field-label">User</span>
                  <strong>{journey.userId}</strong>
                </div>
                <div className="operations-field">
                  <span className="operations-field-label">Source</span>
                  <strong>{journey.source}</strong>
                </div>
                <div className="operations-field">
                  <span className="operations-field-label">Registered at</span>
                  <strong>{journey.registrationAtUtc ? formatUtc(journey.registrationAtUtc) : 'n/a'}</strong>
                </div>
                <div className="operations-field">
                  <span className="operations-field-label">Activated at</span>
                  <strong>{journey.activationAtUtc ? formatUtc(journey.activationAtUtc) : 'n/a'}</strong>
                </div>
                <div className="operations-field">
                  <span className="operations-field-label">Active days</span>
                  <strong>{journey.activeDays.length}</strong>
                </div>
              </div>

              <div className="growth-active-days">
                <span className="operations-field-label">Recorded active days</span>
                <div className="growth-active-day-list">
                  {journey.activeDays.length > 0 ? (
                    journey.activeDays.map((day) => (
                      <span key={day} className="status-badge neutral">{day}</span>
                    ))
                  ) : (
                    <span className="muted-line">No active days recorded.</span>
                  )}
                </div>
              </div>

              <div className="table-scroll-wrap">
                <table className="simple-table growth-journey-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Occurred</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journey.events.map((event, index) => (
                      <tr key={`${event.eventType}:${event.occurredAtUtc}:${index}`}>
                        <td>
                          <div className="identity-stack">
                            <strong>{eventLabel(event.eventType)}</strong>
                            <span className="identity-subline">{formatRelativeFromNow(event.occurredAtUtc)}</span>
                          </div>
                        </td>
                        <td>{formatUtc(event.occurredAtUtc)}</td>
                        <td>{describeJourneyEvent(event)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p className="muted-line">
                Enter an account ID to load the exact lifecycle and activity timeline for that user.
              </p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
