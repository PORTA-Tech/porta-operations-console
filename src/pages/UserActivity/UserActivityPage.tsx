import { useEffect, useMemo, useState } from 'react';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { fetchMachineDailyStats, type MachineDailyStats } from '../../api/machines';
import { formatSeconds, relativeTime, pressureColor, attentionStateClass, attentionStateLabel } from '../../utils/console';
import {
  countDistractionPatterns,
  isLiveState,
  isSegmentStale,
  machinePresence
} from '../../utils/fleetTruth';

export function UserActivityPage() {
  const { rows } = useMachineSummaryFeed();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Behavior metrics only make sense for machines reporting right now with
  // real input history (fleetTruth.isLiveState). Everything else is a frozen
  // last report — rendering it as FOCUSED was the old lie this page told.
  const liveRows = useMemo(() => rows.filter(isLiveState), [rows]);
  const liveCount = liveRows.length;

  const activeCount = liveRows.filter((r) => r.activityDetected).length;
  const focusCount = liveRows.filter((r) => r.attentionSegmentKind === 'focus').length;
  const awayCount = liveRows.filter((r) => r.attentionSegmentKind === 'away').length;

  // focusEpisodeSeconds is the CURRENT episode length, not a daily total —
  // label it as such. Stale counters (see isSegmentStale) are excluded.
  const avgFocusSeconds = useMemo(() => {
    const withData = liveRows.filter(
      (r) => r.focusEpisodeSeconds && r.focusEpisodeSeconds > 0 && !isSegmentStale(r.focusEpisodeSeconds)
    );
    if (withData.length === 0) return null;
    const total = withData.reduce((s, r) => s + (r.focusEpisodeSeconds ?? 0), 0);
    return Math.round(total / withData.length);
  }, [liveRows]);

  // Distraction patterns — instantaneous counts across live machines, matched
  // on attentionSegmentKind (fleetTruth.countDistractionPatterns).
  const patterns = useMemo(() => {
    const counts = countDistractionPatterns(liveRows);
    return [
      { label: 'App-switch spiral', count: counts.appSwitch },
      { label: 'Junk browsing', count: counts.junkBrowsing },
      { label: 'Social interrupt', count: counts.socialInterrupt },
      { label: 'Idle drift', count: counts.idleDrift },
      { label: 'Overload pressure', count: counts.overload },
    ];
  }, [liveRows]);

  const avgPressure = useMemo(() => {
    const withData = liveRows.filter((r) => r.pressureLevel != null);
    if (withData.length === 0) return null;
    return Math.round(
      (withData.reduce((s, r) => s + (r.pressureLevel ?? 0), 0) / withData.length) * 100
    );
  }, [liveRows]);

  const liveSub = `Of ${liveCount} live machine${liveCount === 1 ? '' : 's'}`;

  return (
    <>
      {/* Fleet strip */}
      <div className="fleet-strip">
        <div className="fleet-card c-accent">
          <div className="fc-label">Active Right Now</div>
          <div className="fc-val accent">{activeCount}</div>
          <div className="fc-sub">{liveSub}</div>
        </div>
        <div className="fleet-card c-green">
          <div className="fc-label">In Focus</div>
          <div className="fc-val green">{focusCount}</div>
          <div className="fc-sub">{liveSub}</div>
        </div>
        <div className="fleet-card c-amber">
          <div className="fc-label">Away</div>
          <div className="fc-val amber">{awayCount}</div>
          <div className="fc-sub">{liveSub}</div>
        </div>
        <div className="fleet-card c-blue">
          <div className="fc-label">Avg Focus Episode</div>
          <div className="fc-val blue">{avgFocusSeconds ? formatSeconds(avgFocusSeconds) : '—'}</div>
          <div className="fc-sub">Current episode, live machines</div>
        </div>
      </div>

      <div className="grid-2-1">
        {/* Machine state cards */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Live Machine States</div>
              <div className="card-sub">Per-machine attention state · updates every 5s</div>
            </div>
            <span className="card-tag tag-green">Live</span>
          </div>
          <div className="card-body" style={{ padding: '16px' }}>
            {rows.length === 0 ? (
              <div className="empty-state">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, margin: '0 auto' }}>
                  <circle cx="12" cy="8" r="4" /><path d="M6 20v-2a6 6 0 0 1 12 0v2" />
                </svg>
                <p>No machines reporting.</p>
              </div>
            ) : (
              <div className="machine-grid">
                {rows.map((r) => {
                  const live = isLiveState(r);
                  const presence = machinePresence(r);
                  const noData = presence !== 'offline' && r.hasInputData === false;
                  const stateClass = live ? attentionStateClass(r.attentionSegmentKind, r.agentRunning) : 'state-offline';
                  const stateLabel = live
                    ? attentionStateLabel(r.attentionSegmentKind, r.agentRunning)
                    : noData ? 'NO DATA' : presence === 'recent' ? 'IDLE' : 'OFFLINE';
                  const pColor = live ? pressureColor(r.pressureLevel) : 'var(--muted)';
                  const pressurePct = live && r.pressureLevel != null ? `${Math.round(r.pressureLevel * 100)}%` : '—';
                  const focusStale = isSegmentStale(r.focusEpisodeSeconds);
                  const segmentStale = isSegmentStale(r.attentionSegmentSeconds);
                  const expanded = expandedId === r.machineId;

                  return (
                    <div
                      className="machine-card"
                      key={r.machineId}
                      onClick={() => setExpandedId(expanded ? null : r.machineId)}
                      title="Click for 14-day focus / distraction history"
                      style={{ cursor: 'pointer', ...(live ? {} : { opacity: 0.6 }) }}
                    >
                      <div className="mc-top">
                        <div>
                          <div className="mc-name">{r.machineName}</div>
                          <div className="mc-user">{r.userName}</div>
                        </div>
                        <span
                          className={`state-badge ${stateClass}`}
                          title={noData ? 'No input has ever been captured from this machine' : undefined}
                          style={noData ? { color: 'var(--amber)', borderColor: 'var(--amber)', cursor: 'help' } : undefined}
                        >
                          {stateLabel}
                        </span>
                      </div>
                      <div className="mc-metrics">
                        <div>
                          <div
                            className="mc-metric-val"
                            title={focusStale ? 'Counter from the agent is implausibly large — treated as stale' : undefined}
                            style={focusStale ? { color: 'var(--amber)', cursor: 'help' } : undefined}
                          >
                            {live ? (focusStale ? 'stale' : formatSeconds(r.focusEpisodeSeconds)) : '—'}
                          </div>
                          <div className="mc-metric-lbl">Current focus</div>
                        </div>
                        <div>
                          <div className="mc-metric-val" style={{ color: pColor }}>{pressurePct}</div>
                          <div className="mc-metric-lbl">Pressure</div>
                        </div>
                      </div>
                      <div className="mc-last">
                        {live
                          ? segmentStale
                            ? <span title="Counter from the agent is implausibly large — treated as stale">In state: stale · </span>
                            : `In state ${formatSeconds(r.attentionSegmentSeconds)} · `
                          : ''}
                        Updated {relativeTime(r.reportedAtUtc)}
                      </div>
                      {expanded && <MachineDailyHistory machineId={r.machineId} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Fleet distraction */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Fleet Distraction</div>
              <div className="card-sub">Live machines currently in each state</div>
            </div>
          </div>
          <div className="card-body">
            {patterns.map(({ label, count }) => {
              const pct = liveCount > 0 ? Math.round((count / liveCount) * 100) : 0;
              const fillColor = pct > 50 ? 'var(--accent)' : pct > 25 ? 'var(--amber)' : 'var(--muted)';
              const fillClass = pct > 50 ? 'prog-fill-accent' : pct > 25 ? 'prog-fill-amber' : '';
              const fillStyle = pct <= 25 ? { background: 'var(--muted)' } : {};
              return (
                <div className="prog-row" key={label}>
                  <div className="prog-label">{label}</div>
                  <div className="prog-track">
                    <div className={`prog-fill ${fillClass}`} style={{ width: `${pct}%`, ...fillStyle }} />
                  </div>
                  <div className="prog-val" style={{ color: fillColor }}>{count}/{liveCount}</div>
                </div>
              );
            })}
            {liveCount < 3 && (
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '8px', fontFamily: 'var(--font-m)' }}>
                Only {liveCount} machine{liveCount === 1 ? '' : 's'} reporting live — fleet patterns need more agents online to mean anything.
              </div>
            )}
            <div className="divider" />
            <div className="inline-stats">
              <div>
                <div className="i-stat-val" style={{ color: 'var(--accent)' }}>
                  {avgFocusSeconds ? formatSeconds(avgFocusSeconds) : '—'}
                </div>
                <div className="i-stat-lbl">Avg focus episode</div>
              </div>
              <div>
                <div className="i-stat-val">{avgPressure === null ? '—' : `${avgPressure}%`}</div>
                <div className="i-stat-lbl">Avg pressure (live)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Inline 14-day focus / distraction / away history for one machine's linked user account.
 * Fetched on demand from the control plane's /v1/machines/:id/daily-stats endpoint.
 * Styled inline so it renders predictably regardless of the page's CSS.
 */
function MachineDailyHistory({ machineId }: { machineId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<MachineDailyStats[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMachineDailyStats(machineId, 14)
      .then((data) => {
        if (!cancelled) {
          setDays(data);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load history');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [machineId]);

  const note = (text: string) => (
    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-m)' }}>{text}</div>
  );

  if (loading) return note('Loading 14-day history…');
  if (error) return note(`Couldn't load history: ${error}`);
  if (days.length === 0) return note('No daily history yet for this user.');

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border, rgba(255,255,255,0.08))' }}
    >
      {(() => {
        const latest = days[0];
        const today = latest?.labelsToday ?? 0;
        const week = latest?.labelsThisWeek ?? 0;
        const byTarget = latest?.labelsByTarget ?? [];
        const fmt = (target: string): string =>
          ({ focus_state: 'focus', distraction: 'distraction', overload: 'overload', break_need: 'break' } as Record<string, string>)[target] ?? target;
        const parts =
          byTarget.length === 0
            ? 'none yet'
            : byTarget.map((t) => `${fmt(t.target)} ${t.count} (${t.net >= 0 ? '+' : ''}${t.net})`).join(', ');
        return (
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8, fontFamily: 'var(--font-m)' }}>
            Ground-truth labels · {today} today, {week} this week · {parts}
          </div>
        );
      })()}
      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, fontFamily: 'var(--font-m)' }}>
        Last 14 days · focus / distraction / away
      </div>
      {days.map((d) => {
        const tracked = Math.max(1, d.trackedSeconds);
        const focusPct = (d.focusSeconds / tracked) * 100;
        const distractionPct = (d.distractionSeconds / tracked) * 100;
        const awayPct = (d.awaySeconds / tracked) * 100;
        return (
          <div key={d.dateLocal} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 42, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-m)' }}>
              {d.dateLocal.slice(5)}
            </div>
            <div
              style={{
                flex: 1,
                height: 10,
                display: 'flex',
                borderRadius: 3,
                overflow: 'hidden',
                background: 'var(--muted)'
              }}
            >
              <div style={{ width: `${focusPct}%`, background: 'var(--green)' }} title={`Focus ${formatSeconds(d.focusSeconds)}`} />
              <div style={{ width: `${distractionPct}%`, background: 'var(--accent)' }} title={`Distraction ${formatSeconds(d.distractionSeconds)}`} />
              <div style={{ width: `${awayPct}%`, background: 'var(--amber)' }} title={`Away ${formatSeconds(d.awaySeconds)}`} />
            </div>
            <div style={{ width: 34, textAlign: 'right', fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-m)' }}>
              {Math.round(focusPct)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
