import { useMemo } from 'react';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { formatSeconds, relativeTime, pressureColor, attentionStateClass, attentionStateLabel } from '../../utils/console';

export function UserActivityPage() {
  const { rows } = useMachineSummaryFeed();

  const activeCount = rows.filter((r) => r.activityDetected).length;
  const focusCount = rows.filter((r) => r.attentionSegmentKind === 'focus').length;
  const awayCount = rows.filter((r) => r.attentionSegmentKind === 'away').length;

  const avgFocusSeconds = useMemo(() => {
    const withData = rows.filter((r) => r.focusEpisodeSeconds && r.focusEpisodeSeconds > 0);
    if (withData.length === 0) return null;
    const total = withData.reduce((s, r) => s + (r.focusEpisodeSeconds ?? 0), 0);
    return Math.round(total / withData.length);
  }, [rows]);

  // Distraction patterns
  const total = rows.length || 1;
  const patterns = useMemo(() => {
    const appSwitch = rows.filter((r) => r.attentionSegmentReasonCode === 'fragmentation_distraction').length;
    const junkBrowse = rows.filter((r) => r.attentionSegmentReasonCode === 'outside_focus_context').length;
    const socialInt = rows.filter((r) => r.attentionSegmentReasonCode === 'context_excursion').length;
    const idleDrift = rows.filter((r) => r.attentionSegmentKind === 'away').length;
    const overload = rows.filter((r) => r.overloadActive).length;
    return [
      { label: 'App-switch spiral', count: appSwitch },
      { label: 'Junk browsing', count: junkBrowse },
      { label: 'Social interrupt', count: socialInt },
      { label: 'Idle drift', count: idleDrift },
      { label: 'Overload pressure', count: overload },
    ];
  }, [rows]);

  const avgPressure = useMemo(() => {
    const withData = rows.filter((r) => r.pressureLevel != null);
    if (withData.length === 0) return 0;
    return Math.round(
      (withData.reduce((s, r) => s + (r.pressureLevel ?? 0), 0) / withData.length) * 100
    );
  }, [rows]);

  return (
    <>
      {/* Fleet strip */}
      <div className="fleet-strip">
        <div className="fleet-card c-accent">
          <div className="fc-label">Active Right Now</div>
          <div className="fc-val accent">{activeCount}</div>
          <div className="fc-sub">Activity detected</div>
        </div>
        <div className="fleet-card c-green">
          <div className="fc-label">In Focus</div>
          <div className="fc-val green">{focusCount}</div>
          <div className="fc-sub">Focused work state</div>
        </div>
        <div className="fleet-card c-amber">
          <div className="fc-label">Away</div>
          <div className="fc-val amber">{awayCount}</div>
          <div className="fc-sub">No recent input</div>
        </div>
        <div className="fleet-card c-blue">
          <div className="fc-label">Avg Focus Today</div>
          <div className="fc-val blue">{avgFocusSeconds ? formatSeconds(avgFocusSeconds) : '—'}</div>
          <div className="fc-sub">Across active machines</div>
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
                  const stateClass = attentionStateClass(r.attentionSegmentKind, r.agentRunning);
                  const stateLabel = attentionStateLabel(r.attentionSegmentKind, r.agentRunning);
                  const pColor = pressureColor(r.pressureLevel);
                  const pressurePct = r.pressureLevel != null ? `${Math.round(r.pressureLevel * 100)}%` : '—';

                  return (
                    <div className="machine-card" key={r.machineId}>
                      <div className="mc-top">
                        <div>
                          <div className="mc-name">{r.machineName}</div>
                          <div className="mc-user">{r.userName}</div>
                        </div>
                        <span className={`state-badge ${stateClass}`}>{stateLabel}</span>
                      </div>
                      <div className="mc-metrics">
                        <div>
                          <div className="mc-metric-val">{formatSeconds(r.focusEpisodeSeconds)}</div>
                          <div className="mc-metric-lbl">Focus today</div>
                        </div>
                        <div>
                          <div className="mc-metric-val" style={{ color: pColor }}>{pressurePct}</div>
                          <div className="mc-metric-lbl">Pressure</div>
                        </div>
                      </div>
                      <div className="mc-last">
                        In state {formatSeconds(r.attentionSegmentSeconds)} · Updated {relativeTime(r.reportedAtUtc)}
                      </div>
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
              <div className="card-sub">Patterns firing most</div>
            </div>
          </div>
          <div className="card-body">
            {patterns.map(({ label, count }) => {
              const pct = Math.round((count / total) * 100);
              const fillColor = pct > 50 ? 'var(--accent)' : pct > 25 ? 'var(--amber)' : 'var(--muted)';
              const fillClass = pct > 50 ? 'prog-fill-accent' : pct > 25 ? 'prog-fill-amber' : '';
              const fillStyle = pct <= 25 ? { background: 'var(--muted)' } : {};
              return (
                <div className="prog-row" key={label}>
                  <div className="prog-label">{label}</div>
                  <div className="prog-track">
                    <div className={`prog-fill ${fillClass}`} style={{ width: `${pct}%`, ...fillStyle }} />
                  </div>
                  <div className="prog-val" style={{ color: fillColor }}>{pct}%</div>
                </div>
              );
            })}
            <div className="divider" />
            <div className="inline-stats">
              <div>
                <div className="i-stat-val" style={{ color: 'var(--accent)' }}>
                  {avgFocusSeconds ? formatSeconds(avgFocusSeconds) : '—'}
                </div>
                <div className="i-stat-lbl">Avg focus today</div>
              </div>
              <div>
                <div className="i-stat-val">{avgPressure}%</div>
                <div className="i-stat-lbl">Avg pressure</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
