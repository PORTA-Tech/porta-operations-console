import { useEffect, useMemo, useState } from 'react';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { fetchMachineUptime, type UptimeSample } from '../../api/machines';
import { relativeTime, getDayLabels, getLastSevenDayStrings } from '../../utils/console';

// ─── UPTIME HELPERS ───────────────────────────────────────────────────────────

function computeDayBuckets(
  samples: UptimeSample[],
  dayStrings: string[]
): ('online' | 'offline')[] {
  return dayStrings.map((day) => {
    const daySamples = samples.filter((s) => s.sampledAtUtc.slice(0, 10) === day);
    return daySamples.some((s) => s.agentRunning) ? 'online' : 'offline';
  });
}

function uptimePct(buckets: ('online' | 'offline')[]): number {
  return Math.round((buckets.filter((b) => b === 'online').length / buckets.length) * 100);
}

// ─── QUALITY TREND SVG ───────────────────────────────────────────────────────

interface QualityTrendProps {
  allUptime: Record<string, ('online' | 'offline')[]>;
  machineCount: number;
}

function QualityTrendChart({ allUptime, machineCount }: QualityTrendProps) {
  const W = 400, H = 140;
  const pad = { t: 10, b: 10, l: 10, r: 10 };

  const healthy: number[] = [];
  const degraded: number[] = [];
  const disconnected: number[] = [];

  for (let d = 0; d < 7; d++) {
    let h = 0, deg = 0, disc = 0;
    Object.values(allUptime).forEach((buckets) => {
      const status = buckets[d] ?? 'offline';
      if (status === 'online') h++;
      else disc++;
    });
    // Any machines with no uptime data at all are disconnected
    const tracked = Object.keys(allUptime).length;
    disc += Math.max(0, machineCount - tracked);
    healthy.push(h);
    degraded.push(deg);
    disconnected.push(disc);
  }

  const maxVal = Math.max(1, machineCount);
  const dw = (W - pad.l - pad.r) / 7;
  const scaleY = (v: number) =>
    H - pad.b - (v / maxVal) * (H - pad.t - pad.b);

  const datasets = [
    { data: healthy, color: 'rgba(74,222,128,0.7)' },
    { data: degraded, color: 'rgba(251,191,36,0.6)' },
    { data: disconnected, color: 'rgba(248,113,113,0.6)' },
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
      {datasets.map(({ data, color }) => {
        const pts = data.map((v, i) => {
          const x = pad.l + i * dw + dw / 2;
          const y = scaleY(v);
          return `${x},${y}`;
        });
        const d = pts.map((p, i) => (i === 0 ? `M${p}` : `L${p}`)).join(' ');
        return (
          <g key={color}>
            <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {data.map((v, i) => {
              const x = pad.l + i * dw + dw / 2;
              const y = scaleY(v);
              return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

export function SystemHealthPage() {
  const { rows, lastRefreshUtc } = useMachineSummaryFeed();
  const [allUptimeData, setAllUptimeData] = useState<Record<string, UptimeSample[]>>({});
  const dayStrings = useMemo(() => getLastSevenDayStrings(), []);
  const dayLabels = useMemo(() => getDayLabels(), []);

  // Fetch uptime for all machines once rows are available
  useEffect(() => {
    if (rows.length === 0) return;
    let cancelled = false;

    Promise.all(
      rows.map((r) =>
        fetchMachineUptime(r.machineId, 7)
          .then((data) => ({ id: r.machineId, data }))
          .catch(() => ({ id: r.machineId, data: [] as UptimeSample[] }))
      )
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, UptimeSample[]> = {};
      results.forEach(({ id, data }) => { map[id] = data; });
      setAllUptimeData(map);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRefreshUtc]);

  // Per-machine day buckets
  const machineBuckets = useMemo(() => {
    const result: Record<string, ('online' | 'offline')[]> = {};
    rows.forEach((r) => {
      const samples = allUptimeData[r.machineId] ?? [];
      result[r.machineId] = computeDayBuckets(samples, dayStrings);
    });
    return result;
  }, [allUptimeData, rows, dayStrings]);

  // Fleet strip counts
  const healthyCount = rows.filter(
    (r) => r.agentRunning && r.userSessionConnected && !r.partialData && !r.lastError
  ).length;
  const degradedCount = rows.filter(
    (r) => r.partialData === true || (r.missingMajorChannels?.length ?? 0) > 0
  ).length;
  const disconnectedCount = rows.filter((r) => !r.agentRunning).length;
  const noActivityRows = rows.filter((r) => !r.activityDetected && r.agentRunning);
  const noActivityCount = noActivityRows.length;
  const noActivityLastUtc = noActivityRows
    .map((r) => r.lastActivityUtc)
    .filter(Boolean)
    .sort()
    .at(-1);

  const noActivitySub = noActivityLastUtc
    ? `Last activity ${relativeTime(noActivityLastUtc)}`
    : 'No recent activity';

  // Simplified quality trend data from buckets
  const allBuckets = useMemo(() => {
    const result: Record<string, ('online' | 'offline')[]> = {};
    Object.entries(machineBuckets).forEach(([id, buckets]) => {
      result[id] = buckets;
    });
    return result;
  }, [machineBuckets]);

  return (
    <>
      {/* Fleet strip */}
      <div className="fleet-strip">
        <div className="fleet-card c-green">
          <div className="fc-label">Healthy</div>
          <div className="fc-val green">{healthyCount}</div>
          <div className="fc-sub">All systems operational</div>
        </div>
        <div className="fleet-card c-amber">
          <div className="fc-label">Degraded Capture</div>
          <div className="fc-val amber">{degradedCount}</div>
          <div className="fc-sub">{degradedCount === 1 ? 'Needs attention' : 'Need attention'}</div>
        </div>
        <div className="fleet-card c-red">
          <div className="fc-label">Disconnected</div>
          <div className="fc-val red">{disconnectedCount}</div>
          <div className="fc-sub">Agents offline</div>
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
                <div className="legend-dot" style={{ background: 'var(--bg3)' }} />
                Offline
              </div>
            </div>
            {rows.map((r) => {
              const buckets = machineBuckets[r.machineId] ?? Array(7).fill('offline');
              const pct = uptimePct(buckets);
              const pctColor = pct > 70 ? 'var(--green)' : pct > 30 ? 'var(--amber)' : 'var(--red)';
              return (
                <div className="uptime-row" key={r.machineId}>
                  <div className="uptime-name">{r.machineName}</div>
                  <div className="uptime-bars">
                    {buckets.map((b, i) => (
                      <div key={i} className={`uptime-bar ${b}`} />
                    ))}
                  </div>
                  <div className="uptime-pct" style={{ color: pctColor }}>{pct}%</div>
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
          <div className="card-header">
            <div>
              <div className="card-title">Capture Quality Trend</div>
              <div className="card-sub">Healthy / Degraded / Disconnected count per day</div>
            </div>
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
            <QualityTrendChart allUptime={allBuckets} machineCount={rows.length} />
            <div className="chart-label-row">
              {dayLabels.map((l) => (
                <span key={l} className="chart-label">{l}</span>
              ))}
            </div>
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
                  <th>Device Status</th>
                  <th>Last Seen</th>
                  <th>Agent</th>
                  <th>Activity</th>
                  <th>7d Uptime</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const buckets = machineBuckets[r.machineId] ?? Array(7).fill('offline');
                  const pct = uptimePct(buckets);
                  const upColor = pct > 70 ? 'var(--green)' : pct > 30 ? 'var(--amber)' : 'var(--red)';
                  const errorMsg = r.lastError || r.captureFailureReason || r.ownershipWarning || '';
                  return (
                    <tr key={r.machineId}>
                      <td><div className="td-main">{r.machineName}</div></td>
                      <td>
                        <div style={{ fontSize: '12px', color: 'var(--text)' }}>{r.userName}</div>
                        {r.primaryEmail && <div className="td-email">{r.primaryEmail}</div>}
                      </td>
                      <td>
                        <span className="state-badge state-focused" style={{ fontSize: '9px' }}>
                          {(r as { deviceStatus?: string }).deviceStatus || 'Active'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-m)', fontSize: '11px' }}>
                        {relativeTime(r.reportedAtUtc)}
                      </td>
                      <td>
                        {r.agentRunning
                          ? <span style={{ color: 'var(--green)', fontFamily: 'var(--font-m)', fontSize: '11px' }}>Yes</span>
                          : <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-m)', fontSize: '11px' }}>No</span>}
                      </td>
                      <td>
                        {r.activityDetected
                          ? <span style={{ color: 'var(--green)', fontFamily: 'var(--font-m)', fontSize: '11px' }}>Yes</span>
                          : <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-m)', fontSize: '11px' }}>No</span>}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-m)', fontSize: '11px', color: upColor }}>{pct}%</span>
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {errorMsg || '—'}
                      </td>
                    </tr>
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
