import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { fetchMachineUptime, type UptimeSample } from '../../api/machines';
import { relativeTime, getLastSevenUtcDays } from '../../utils/console';
import {
  hasNoLiveActivity,
  isDormant,
  machinePresence,
  summarizeFleetHealth,
  type MachinePresence
} from '../../utils/fleetTruth';

const PRESENCE_STYLE: Record<MachinePresence, { color: string; label: string }> = {
  online: { color: 'var(--green)', label: 'ONLINE' },
  recent: { color: 'var(--amber)', label: 'RECENT' },
  offline: { color: 'var(--red)', label: 'OFFLINE' }
};

// ─── UPTIME HELPERS ───────────────────────────────────────────────────────────

// Per-machine, per-day capture status derived from uptime samples.
// 'nodata' (no samples recorded that day) is rendered as a gap — it must
// never masquerade as "offline", which is a positive observation.
type DayStatus = 'active' | 'degraded' | 'offline' | 'nodata';

const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  active: 'Online with activity',
  degraded: 'Agent running, no activity captured',
  offline: 'Agent offline',
  nodata: 'No samples recorded'
};

const DAY_STATUS_COLOR: Record<DayStatus, string> = {
  active: 'var(--green)',
  degraded: 'var(--amber)',
  offline: 'var(--red)',
  nodata: 'transparent'
};

const DAY_STATUS_BAR_CLASS: Record<DayStatus, string> = {
  active: 'online',
  degraded: 'partial',
  offline: 'offline',
  nodata: 'nodata'
};

function computeDayStatuses(samples: UptimeSample[], dayKeys: string[]): DayStatus[] {
  return dayKeys.map((day) => {
    const daySamples = samples.filter((s) => s.sampledAtUtc.slice(0, 10) === day);
    if (daySamples.length === 0) return 'nodata';
    const running = daySamples.filter((s) => s.agentRunning);
    if (running.length === 0) return 'offline';
    return running.some((s) => s.activityDetected) ? 'active' : 'degraded';
  });
}

// Percentage over days we actually have samples for; null when there is no
// data at all (shown as '—', because 0% would be a lie).
function uptimePct(statuses: DayStatus[]): number | null {
  const known = statuses.filter((s) => s !== 'nodata');
  if (known.length === 0) return null;
  const up = known.filter((s) => s === 'active' || s === 'degraded').length;
  return Math.round((up / known.length) * 100);
}

// ─── QUALITY TREND SVG ───────────────────────────────────────────────────────

interface QualityTrendProps {
  machineDayStatuses: Record<string, DayStatus[]>;
  machineCount: number;
}

interface TrendDay {
  healthy: number;
  degraded: number;
  disconnected: number;
}

// Per-day fleet counts. A day where NO machine has samples is a data gap and
// returns null: we render nothing for it rather than pretending the whole
// fleet was offline (the old chart's "stops on Thursday" effect).
function computeTrendDays(
  machineDayStatuses: Record<string, DayStatus[]>,
  machineCount: number
): (TrendDay | null)[] {
  return Array.from({ length: 7 }, (_, d) => {
    const statuses = Object.values(machineDayStatuses).map((s) => s[d] ?? 'nodata');
    if (!statuses.some((s) => s !== 'nodata')) return null;
    return {
      healthy: statuses.filter((s) => s === 'active').length,
      degraded: statuses.filter((s) => s === 'degraded').length,
      // On a day where other machines reported, a machine with no samples
      // was itself not reporting → disconnected.
      disconnected: statuses.filter((s) => s === 'offline' || s === 'nodata').length
        + Math.max(0, machineCount - statuses.length)
    };
  });
}

function QualityTrendChart({ machineDayStatuses, machineCount }: QualityTrendProps) {
  const W = 400, H = 140;
  const pad = { t: 10, b: 10, l: 10, r: 10 };

  const days = computeTrendDays(machineDayStatuses, machineCount);

  const maxVal = Math.max(1, machineCount);
  const dw = (W - pad.l - pad.r) / 7;
  const xOf = (i: number) => pad.l + i * dw + dw / 2;
  const scaleY = (v: number) =>
    H - pad.b - (v / maxVal) * (H - pad.t - pad.b);

  const series = [
    { key: 'healthy' as const, color: 'rgba(74,222,128,0.7)' },
    { key: 'degraded' as const, color: 'rgba(251,191,36,0.6)' },
    { key: 'disconnected' as const, color: 'rgba(248,113,113,0.6)' },
  ];

  const gridLines = [2, 4, 6, 8].filter((v) => v <= maxVal);

  return (
    <svg width="100%" height="140" viewBox="0 0 400 140">
      {gridLines.map((v) => {
        const y = scaleY(v);
        return (
          <g key={v}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <text x={pad.l} y={y - 3} fill="rgba(255,255,255,0.2)" fontSize="9" fontFamily="JetBrains Mono">{v}</text>
          </g>
        );
      })}
      {series.map(({ key, color }) => {
        let path = '';
        let started = false;
        days.forEach((day, i) => {
          if (!day) {
            started = false;
            return;
          }
          path += `${started ? 'L' : 'M'}${xOf(i)},${scaleY(day[key])} `;
          started = true;
        });
        return (
          <g key={key}>
            <path d={path.trim()} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {days.map((day, i) => (
              day ? <circle key={i} cx={xOf(i)} cy={scaleY(day[key])} r="3" fill={color} /> : null
            ))}
          </g>
        );
      })}
      {days.map((day, i) => (
        day ? null : (
          <text key={i} x={xOf(i)} y={H / 2} fill="rgba(255,255,255,0.18)" fontSize="8" textAnchor="middle" fontFamily="JetBrains Mono">
            no data
          </text>
        )
      ))}
    </svg>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

export function SystemHealthPage() {
  const { rows, error, loading } = useMachineSummaryFeed();
  const [allUptimeData, setAllUptimeData] = useState<Record<string, UptimeSample[]>>({});
  const [expandedMachineId, setExpandedMachineId] = useState<string | null>(null);
  const [trendExpanded, setTrendExpanded] = useState(false);
  const utcDays = useMemo(() => getLastSevenUtcDays(), []);
  const dayKeys = useMemo(() => utcDays.map((d) => d.key), [utcDays]);
  const dayLabels = useMemo(() => utcDays.map((d) => d.label), [utcDays]);

  // Fetch uptime when the machine LIST changes, plus a slow refresh timer.
  // Daily buckets cannot change faster than that — the old code refetched
  // uptime for every machine on every 5-second summary poll.
  const machineIdsKey = useMemo(() => rows.map((r) => r.machineId).sort().join('|'), [rows]);
  useEffect(() => {
    if (!machineIdsKey) return;
    let cancelled = false;
    const ids = machineIdsKey.split('|');

    const load = () => {
      Promise.all(
        ids.map((id) =>
          fetchMachineUptime(id, 7)
            .then((data) => ({ id, data }))
            .catch(() => ({ id, data: [] as UptimeSample[] }))
        )
      ).then((results) => {
        if (cancelled) return;
        const map: Record<string, UptimeSample[]> = {};
        results.forEach(({ id, data }) => { map[id] = data; });
        setAllUptimeData(map);
      });
    };

    load();
    const timer = window.setInterval(load, 5 * 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [machineIdsKey]);

  // Per-machine day statuses
  const machineDayStatuses = useMemo(() => {
    const result: Record<string, DayStatus[]> = {};
    rows.forEach((r) => {
      result[r.machineId] = computeDayStatuses(allUptimeData[r.machineId] ?? [], dayKeys);
    });
    return result;
  }, [allUptimeData, rows, dayKeys]);

  // Fleet strip counts come from ONE exclusive classifier (fleetTruth), computed
  // over the ACTIVE fleet only. Dormant/churned installs (offline > 7d) are
  // pulled into their own count so month-old installs don't inflate the red
  // DISCONNECTED alarm or lie about the denominator.
  const fleetHealth = useMemo(() => summarizeFleetHealth(rows), [rows]);
  const healthyCount = fleetHealth.healthy;
  const degradedCount = fleetHealth.degraded;
  const disconnectedCount = fleetHealth.disconnected;
  const dormantCount = fleetHealth.dormant;
  const activeTotal = fleetHealth.activeTotal;
  const connectedCount = activeTotal - disconnectedCount;

  // Overlay metric, not a bucket: connected machines producing no input.
  const noActivityRows = rows.filter(hasNoLiveActivity);
  const noActivityCount = noActivityRows.length;
  const noActivityLastUtc = noActivityRows
    .map((r) => r.lastActivityUtc)
    .filter(Boolean)
    .sort()
    .at(-1);

  const noActivitySub = noActivityLastUtc
    ? `Last activity ${relativeTime(noActivityLastUtc)}`
    : `Of ${connectedCount} connected`;

  // C7: never render zero-filled dashboards when the API is failing — zeros that
  // mean "logged out" are indistinguishable from a real outage.
  if (!loading && error && rows.length === 0) {
    return (
      <div className="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, margin: '0 auto' }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <p>
          {error.status === 401
            ? 'Your session has expired or you are not signed in. Sign in again to see fleet data.'
            : `Cannot reach the control plane (${error.status ? `HTTP ${error.status}` : error.message}). The numbers below would be meaningless, so nothing is shown.`}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Fleet strip */}
      <div className="fleet-strip">
        <div className="fleet-card c-green">
          <div className="fc-label">Healthy</div>
          <div className="fc-val green">{healthyCount}</div>
          <div className="fc-sub">{healthyCount === activeTotal && activeTotal > 0 ? 'All active machines healthy' : `Of ${activeTotal} active machine${activeTotal === 1 ? '' : 's'}`}</div>
        </div>
        <div className="fleet-card c-amber">
          <div className="fc-label">Degraded Capture</div>
          <div className="fc-val amber">{degradedCount}</div>
          <div className="fc-sub">{degradedCount === 1 ? 'Needs attention' : 'Need attention'}</div>
        </div>
        <div className="fleet-card c-red">
          <div className="fc-label">Disconnected</div>
          <div className="fc-val red">{disconnectedCount}</div>
          <div className="fc-sub">{dormantCount > 0 ? `Recently offline · ${dormantCount} dormant install${dormantCount === 1 ? '' : 's'} excluded` : 'Agents offline'}</div>
        </div>
        <div className="fleet-card c-blue">
          <div className="fc-label">No Live Activity</div>
          <div className="fc-val blue">{noActivityCount}</div>
          <div className="fc-sub">{noActivitySub}</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid-2">
        {/* Uptime chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Agent Uptime — Last 7 Days</div>
              <div className="card-sub">Online vs offline per machine</div>
            </div>
          </div>
          <div className="card-body">
            <div className="chart-legend">
              <div className="legend-item">
                <div className="legend-dot" style={{ background: 'var(--green)', opacity: 0.7 }} />
                Online
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: 'var(--amber)', opacity: 0.6 }} />
                No activity
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: 'var(--bg3)' }} />
                Offline
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: 'transparent', border: '1px dashed var(--bg3)' }} />
                No data
              </div>
            </div>
            {rows.map((r) => {
              const statuses = machineDayStatuses[r.machineId] ?? Array<DayStatus>(7).fill('nodata');
              const pct = uptimePct(statuses);
              const pctColor = pct === null ? 'var(--muted)' : pct > 70 ? 'var(--green)' : pct > 30 ? 'var(--amber)' : 'var(--red)';
              return (
                <div className="uptime-row" key={r.machineId}>
                  <div className="uptime-name">{r.machineName}</div>
                  <div className="uptime-bars">
                    {statuses.map((s, i) => (
                      <div key={i} className={`uptime-bar ${DAY_STATUS_BAR_CLASS[s]}`} title={`${dayLabels[i]}: ${DAY_STATUS_LABEL[s]}`} />
                    ))}
                  </div>
                  <div className="uptime-pct" style={{ color: pctColor }}>{pct === null ? '—' : `${pct}%`}</div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="empty-state">
                <p>No machines reporting.</p>
              </div>
            )}
            <div className="chart-label-row" style={{ paddingLeft: '150px' }}>
              {dayLabels.map((l) => (
                <span key={l} className="chart-label">{l}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Quality trend */}
        <div className="card">
          <div
            className="card-header"
            onClick={() => setTrendExpanded((v) => !v)}
            style={{ cursor: 'pointer' }}
            title="Click for the day-by-day machine breakdown"
          >
            <div>
              <div className="card-title">Capture Quality Trend</div>
              <div className="card-sub">Healthy / Degraded / Disconnected count per day</div>
            </div>
            <span className="card-tag tag-accent">{trendExpanded ? 'Hide details ▾' : 'Details ▸'}</span>
          </div>
          <div className="card-body">
            <div className="chart-legend">
              <div className="legend-item">
                <div className="legend-dot" style={{ background: 'var(--green)' }} />
                Healthy
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: 'var(--amber)' }} />
                Degraded
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: 'var(--red)' }} />
                Disconnected
              </div>
            </div>
            <QualityTrendChart machineDayStatuses={machineDayStatuses} machineCount={rows.length} />
            <div className="chart-label-row">
              {dayLabels.map((l) => (
                <span key={l} className="chart-label">{l}</span>
              ))}
            </div>
            {trendExpanded && (
              <div style={{ marginTop: '12px', overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th>Machine</th>
                      {dayLabels.map((l) => (
                        <th key={l} style={{ textAlign: 'center' }}>{l}</th>
                      ))}
                      <th style={{ textAlign: 'right' }}>7d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const statuses = machineDayStatuses[r.machineId] ?? Array<DayStatus>(7).fill('nodata');
                      const pct = uptimePct(statuses);
                      return (
                        <tr key={r.machineId}>
                          <td><div className="td-main">{r.machineName}</div></td>
                          {statuses.map((s, i) => (
                            <td key={i} style={{ textAlign: 'center' }} title={`${dayLabels[i]}: ${DAY_STATUS_LABEL[s]}`}>
                              <span style={{
                                display: 'inline-block',
                                width: '10px',
                                height: '10px',
                                borderRadius: '2px',
                                background: DAY_STATUS_COLOR[s],
                                border: s === 'nodata' ? '1px dashed var(--bg3)' : 'none',
                                cursor: 'help'
                              }} />
                            </td>
                          ))}
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-m)' }}>{pct === null ? '—' : `${pct}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Machine detail table */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Machine Detail</div>
            <div className="card-sub">Runtime, session, activity, and device-link state</div>
          </div>
          <span className="card-tag tag-accent">{rows.length} machines</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, margin: '0 auto' }}>
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              <p>No machines reporting yet.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>User</th>
                  <th>Status</th>
                  <th>Link</th>
                  <th>Last Seen</th>
                  <th>Agent</th>
                  <th>Activity</th>
                  <th>Capture Issue</th>
                  <th>7d Uptime</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const statuses = machineDayStatuses[r.machineId] ?? Array<DayStatus>(7).fill('nodata');
                  const pct = uptimePct(statuses);
                  const upColor = pct === null ? 'var(--muted)' : pct > 70 ? 'var(--green)' : pct > 30 ? 'var(--amber)' : 'var(--red)';
                  // A dormant install (offline for weeks) surfaces a frozen error
                  // from its last live moment — showing it as a current error is a
                  // lie. The Status column already says how long it's been gone.
                  const errorMsg = isDormant(r) ? '' : (r.lastError || r.captureFailureReason || r.ownershipWarning || '');
                  const captureIssueCode = r.watchdogLaunchFailureCode || r.userAgentCaptureFailureCode || null;
                  const captureIssueLabel = captureIssueCode
                    ? ({
                        service_session: 'Wrong session (no hooks)',
                        hooks_unavailable: 'Hooks blocked',
                        signals_not_delivering: 'Signals not reaching API',
                        self_test_failed: 'Capture self-test failed',
                        no_interactive_session: 'No desktop session found',
                        capture_loop_stalled: 'Capture loop stalled',
                        capture_loop_erroring: 'Capture loop erroring',
                      } as Record<string, string>)[captureIssueCode]
                      ?? (captureIssueCode.startsWith('token_query_failed:') ? 'Session token error'
                        : captureIssueCode.startsWith('process_create_failed:') ? 'Process launch failed'
                        : captureIssueCode)
                    : (r.selfTestEffective === 'stale_pending' ? 'Self-test stuck (no input)' : null);
                  const presence = machinePresence(r);
                  const presenceStyle = PRESENCE_STYLE[presence];
                  const notSignedIn = !r.accountId;
                  const isExpanded = expandedMachineId === r.machineId;
                  return (
                    <Fragment key={r.machineId}>
                    <tr
                      onClick={() => setExpandedMachineId(isExpanded ? null : r.machineId)}
                      style={{ cursor: 'pointer' }}
                      title="Click to view diagnostics and agent log"
                    >
                      <td><div className="td-main">{r.machineName} <span style={{ color: 'var(--muted)', fontSize: '9px' }}>{isExpanded ? '▾' : '▸'}</span></div></td>
                      <td>
                        <div style={{ fontSize: '12px', color: 'var(--text)' }}>{r.userName}</div>
                        {r.primaryEmail && <div className="td-email">{r.primaryEmail}</div>}
                      </td>
                      <td>
                        <span
                          title={presence === 'offline' && r.offlineSinceUtc ? `Offline since ${relativeTime(r.offlineSinceUtc)}` : undefined}
                          style={{ color: presenceStyle.color, fontFamily: 'var(--font-m)', fontSize: '10px', fontWeight: 700, cursor: presence === 'offline' ? 'help' : undefined }}
                        >
                          {presenceStyle.label}
                        </span>
                        {presence === 'offline' && r.offlineSinceUtc && (
                          <div style={{ fontSize: '9px', color: 'var(--muted)' }}>since {relativeTime(r.offlineSinceUtc)}</div>
                        )}
                      </td>
                      <td>
                        {notSignedIn
                          ? <span style={{ color: 'var(--amber)', fontFamily: 'var(--font-m)', fontSize: '9px', fontWeight: 700, border: '1px solid var(--amber)', borderRadius: '4px', padding: '1px 5px' }}>NOT SIGNED IN</span>
                          : <span className="state-badge state-focused" style={{ fontSize: '9px' }}>{(r as { deviceStatus?: string }).deviceStatus || 'linked'}</span>}
                      </td>
                      <td style={{ fontFamily: 'var(--font-m)', fontSize: '11px' }}>
                        {relativeTime(r.reportedAtUtc)}
                      </td>
                      <td>
                        {r.agentRunning
                          ? <span style={{ color: 'var(--green)', fontFamily: 'var(--font-m)', fontSize: '11px' }}>Yes</span>
                          : <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-m)', fontSize: '11px' }}>No</span>}
                        <div
                          title={r.agentOutdated && r.latestKnownAgentVersion ? `Latest is ${r.latestKnownAgentVersion}` : undefined}
                          style={{ fontSize: '9px', fontFamily: 'var(--font-m)', color: r.agentOutdated ? 'var(--red)' : 'var(--muted)', cursor: r.agentOutdated ? 'help' : undefined }}
                        >
                          {r.agentVersion}{r.agentOutdated ? ' ⚠ outdated' : ''}
                        </div>
                      </td>
                      <td>
                        {r.hasInputData === false
                          ? <span title="No input has ever been captured from this machine" style={{ color: 'var(--amber)', fontFamily: 'var(--font-m)', fontSize: '11px', cursor: 'help' }}>no data</span>
                          : r.activityDetected
                            ? <span style={{ color: 'var(--green)', fontFamily: 'var(--font-m)', fontSize: '11px' }}>Yes</span>
                            : <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-m)', fontSize: '11px' }}>No</span>}
                      </td>
                      <td>
                        {captureIssueLabel
                          ? <span title={captureIssueCode ?? r.selfTestEffective ?? undefined} style={{ color: 'var(--red)', fontFamily: 'var(--font-m)', fontSize: '11px', cursor: 'help' }}>{captureIssueLabel}</span>
                          : <span style={{ color: 'var(--green)', fontFamily: 'var(--font-m)', fontSize: '11px' }}>—</span>}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-m)', fontSize: '11px', color: upColor }}>{pct === null ? '—' : `${pct}%`}</span>
                      </td>
                      <td title={r.userAgentSelfTestState ?? undefined} style={{ fontSize: '11px', color: 'var(--muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: r.userAgentSelfTestState ? 'help' : undefined }}>
                        {errorMsg || '—'}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} style={{ background: 'var(--bg2, rgba(255,255,255,0.02))', padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '10px', fontSize: '11px', fontFamily: 'var(--font-m)' }}>
                            <span style={{ color: 'var(--muted2)' }}>Self-test: <span style={{ color: 'var(--text)' }}>{r.selfTestEffective ?? r.userAgentSelfTestState ?? 'n/a'}</span></span>
                            <span style={{ color: 'var(--muted2)' }}>Capture failure: <span style={{ color: 'var(--text)' }}>{r.userAgentCaptureFailureCode ?? '—'}</span></span>
                            <span style={{ color: 'var(--muted2)' }}>Watchdog failure: <span style={{ color: 'var(--text)' }}>{r.watchdogLaunchFailureCode ?? '—'}</span></span>
                            <span style={{ color: 'var(--muted2)' }}>Startup: <span style={{ color: 'var(--text)' }}>{r.userAgentStartupState ?? '—'} ({r.userAgentLastLaunchReason ?? '—'})</span></span>
                            <span style={{ color: 'var(--muted2)' }}>Last input age: <span style={{ color: 'var(--text)' }}>{r.lastAcceptedInputAgeSeconds != null ? `${Math.round(r.lastAcceptedInputAgeSeconds)}s` : 'never'}</span></span>
                            {r.windowsUpdateStatus && (() => {
                              try {
                                const status = JSON.parse(r.windowsUpdateStatus) as { succeeded?: boolean; version?: string; message?: string };
                                return (
                                  <span style={{ color: 'var(--muted2)' }}>
                                    Last update: <span style={{ color: status.succeeded ? 'var(--green)' : 'var(--red)' }}>
                                      {status.succeeded ? `${status.version} installed` : `${status.version} failed`}
                                    </span>
                                    {!status.succeeded && status.message ? <span style={{ color: 'var(--muted)' }}> — {status.message.slice(0, 120)}</span> : null}
                                  </span>
                                );
                              } catch {
                                return null;
                              }
                            })()}
                          </div>
                          {r.userAgentLogTail
                            ? <pre style={{ maxHeight: '260px', overflow: 'auto', fontSize: '10px', lineHeight: 1.5, fontFamily: 'var(--font-m)', color: 'var(--muted2)', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', padding: '10px', whiteSpace: 'pre-wrap', margin: 0 }}>{r.userAgentLogTail}</pre>
                            : <div style={{ fontSize: '11px', color: 'var(--muted)' }}>No agent log received yet — machine needs agent 1.2.82 or newer.</div>}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
