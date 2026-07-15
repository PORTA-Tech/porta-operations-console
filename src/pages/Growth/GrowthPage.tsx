import { useMemo, useState } from 'react';
import { useGrowthDashboard } from '../../hooks/useGrowthDashboard';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { fetchGrowthUserJourney, type GrowthSeries, type GrowthUserJourney } from '../../api/growth';
import { accountsActiveOnDay, aggregateRetention, cohortCellState } from '../../utils/growthTruth';

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// ─── REGISTRATION BAR CHART ──────────────────────────────────────────────────

function RegistrationChart({ series }: { series: GrowthSeries | undefined }) {
  const W = 500, H = 170, padB = 24, padT = 18;
  if (!series || series.points.length === 0) {
    return (
      <svg width="100%" height="170" viewBox="0 0 500 170">
        <text x="250" y="85" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="12" fontFamily="JetBrains Mono">No data</text>
      </svg>
    );
  }

  const points = series.points.slice(-30);
  const n = points.length;
  const dw = W / n;
  // Bars are scaled by value — the old chart drew +4 and +1 at identical
  // heights (any non-zero value rendered at a fixed 70%).
  const maxV = Math.max(1, ...points.map((p) => p.value));
  const maxH = H - padB - padT;

  return (
    <svg width="100%" height="170" viewBox={`0 0 ${W} ${H}`}>
      {points.map((p, i) => {
        const x = i * dw + dw * 0.15;
        const bw = dw * 0.7;
        const bh = p.value === 0 ? 3 : (p.value / maxV) * maxH;
        const y = H - padB - bh;
        const col = p.value > 0 ? 'rgba(200,255,71,0.85)' : 'rgba(255,255,255,0.04)';
        return (
          <g key={p.bucketStartUtc}>
            <rect x={x} y={y} width={bw} height={bh} rx="3" fill={col} />
            {p.value > 0 && (
              <>
                <text x={x + bw / 2} y={y - 6} textAnchor="middle" fill="rgba(200,255,71,0.9)" fontSize="10" fontFamily="JetBrains Mono">+{p.value}</text>
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="8" fontFamily="JetBrains Mono">{shortDate(p.bucketStartUtc)}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── DAU LINE/AREA CHART ─────────────────────────────────────────────────────

interface DauChartProps {
  series: GrowthSeries | undefined;
  selectedDay: string | null;
  onSelectDay: (dayKey: string) => void;
}

function DauChart({ series, selectedDay, onSelectDay }: DauChartProps) {
  const W = 500, H = 170, padL = 18, padR = 18, padB = 26, padT = 20;
  if (!series || series.points.length === 0) {
    return (
      <svg width="100%" height="170" viewBox="0 0 500 170">
        <text x="250" y="85" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="12" fontFamily="JetBrains Mono">No data</text>
      </svg>
    );
  }

  const pts = series.points.slice(-10);
  const n = pts.length;
  const maxY = Math.max(1, ...pts.map((p) => p.value));
  const dw = n > 1 ? (W - padL - padR) / (n - 1) : 0;
  const scaleY = (v: number) => H - padB - (v / maxY) * (H - padB - padT);

  const coords = pts.map((p, i) => ({
    x: padL + i * dw,
    y: scaleY(p.value),
    v: p.value,
    key: p.bucketStartUtc.slice(0, 10),
    label: shortDate(p.bucketStartUtc)
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1]!.x},${H - padB} L${padL},${H - padB} Z`;
  // Date labels sit under their own points — the old chart spread the last 5
  // dates evenly under 10 points, so labels did not match the data above them.
  const labelStep = n > 7 ? 2 : 1;

  return (
    <svg width="100%" height="170" viewBox={`0 0 ${W} ${H}`}>
      {[1, 2, 3].filter((v) => v <= maxY + 1).map((v) => {
        const y = scaleY(v);
        return (
          <g key={v}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <text x={padL + 4} y={y - 3} fill="rgba(255,255,255,0.2)" fontSize="9" fontFamily="JetBrains Mono">{v}</text>
          </g>
        );
      })}
      <path d={areaPath} fill="rgba(200,255,71,0.06)" />
      <path d={linePath} fill="none" stroke="rgba(200,255,71,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => {
        const selected = c.key === selectedDay;
        return (
          <g key={c.key} onClick={() => onSelectDay(c.key)} style={{ cursor: 'pointer' }}>
            {/* generous invisible hit target */}
            <rect x={c.x - dw / 2} y={padT - 10} width={Math.max(dw, 24)} height={H - padT} fill="transparent" />
            <circle cx={c.x} cy={c.y} r={selected ? 7 : 5} fill={selected ? 'rgba(200,255,71,0.9)' : 'var(--bg1)'} stroke="rgba(200,255,71,0.9)" strokeWidth="2" />
            <text x={c.x} y={c.y - 10} textAnchor="middle" fill="rgba(200,255,71,0.7)" fontSize="10" fontFamily="JetBrains Mono">{c.v}</text>
            {(i % labelStep === 0 || i === n - 1) && (
              <text x={c.x} y={H - 8} textAnchor="middle" fill={selected ? 'rgba(200,255,71,0.8)' : 'rgba(255,255,255,0.35)'} fontSize="8" fontFamily="JetBrains Mono">{c.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

export function GrowthPage() {
  const { loading, error, summary, seriesByMetric, cohorts } = useGrowthDashboard();
  const machineFeed = useMachineSummaryFeed();

  // ── DAU day drill-down ──
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [journeys, setJourneys] = useState<Record<string, GrowthUserJourney>>({});
  const [journeysLoaded, setJourneysLoaded] = useState(false);
  const [journeysLoading, setJourneysLoading] = useState(false);

  const accountIds = useMemo(
    () => Array.from(new Set(machineFeed.rows.map((r) => r.accountId).filter((id): id is string => Boolean(id)))),
    [machineFeed.rows]
  );

  // Resolve account → user labels and machines from the fleet feed.
  const accountInfo = useMemo(() => {
    const map = new Map<string, { label: string; machines: string[] }>();
    machineFeed.rows.forEach((r) => {
      if (!r.accountId) return;
      const existing = map.get(r.accountId);
      const label = r.primaryEmail ?? r.displayName ?? r.userName;
      if (existing) {
        existing.machines.push(r.machineName);
      } else {
        map.set(r.accountId, { label, machines: [r.machineName] });
      }
    });
    return map;
  }, [machineFeed.rows]);

  // Journeys are fetched once, on the first day click — not in an effect and
  // never on the polling cycle.
  const handleSelectDay = (day: string) => {
    setSelectedDay((prev) => (prev === day ? null : day));
    if (journeysLoaded || journeysLoading || accountIds.length === 0) return;
    setJourneysLoading(true);
    Promise.all(
      accountIds.map((id) =>
        fetchGrowthUserJourney(id).then((j) => ({ id, j })).catch(() => null)
      )
    ).then((results) => {
      const map: Record<string, GrowthUserJourney> = {};
      results.forEach((r) => { if (r) map[r.id] = r.j; });
      setJourneys(map);
      setJourneysLoaded(true);
      setJourneysLoading(false);
    });
  };

  // ── Retention derived from cohort windows (real denominators) ──
  const retention = useMemo(() => {
    const rows = cohorts?.rows ?? [];
    return { d1: aggregateRetention(rows, 1), d7: aggregateRetention(rows, 7), d30: aggregateRetention(rows, 30) };
  }, [cohorts]);

  if (loading) {
    return (
      <div className="empty-state">
        <p style={{ color: 'var(--muted)' }}>Loading growth data…</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, margin: '0 auto' }}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
        <p>Growth data unavailable.<br />The control plane may be starting up.</p>
      </div>
    );
  }

  const regSeries = seriesByMetric.registrations;
  const dauSeries = seriesByMetric.active_users;

  const todayDau = dauSeries?.points.at(-1)?.value ?? 0;
  const newUsers = summary.newRegisteredUsers;

  const d1Pct = summary.retentionRateD1Pct != null ? `${summary.retentionRateD1Pct.toFixed(1)}%` : 'n/a';
  const d7Pct = summary.retentionRateD7Pct != null ? `${summary.retentionRateD7Pct.toFixed(1)}%` : 'n/a';
  // Activation % is derived from the exact fraction shown beneath it
  // (activated / registered) so the headline number can never contradict its
  // own "1/6 activated" subtitle, which is what the backend rate did.
  const actRate = summary.totalRegisteredUsers > 0
    ? (summary.activatedUsers / summary.totalRegisteredUsers) * 100
    : null;
  const actPct = actRate != null ? `${actRate.toFixed(1)}%` : 'n/a';

  const d7Color = summary.retentionRateD7Pct != null
    ? (summary.retentionRateD7Pct >= 80 ? 'var(--green)' : summary.retentionRateD7Pct >= 50 ? 'var(--amber)' : 'var(--red)')
    : 'var(--muted)';

  const retentionSub = (agg: typeof retention.d1): string => {
    if (agg.pct == null) return agg.pendingUsers > 0 ? 'Maturing' : 'No data';
    const base = `${agg.retained}/${agg.eligible} eligible returned`;
    return agg.missingUsers > 0 ? `${base} · ${agg.missingUsers} no data` : base;
  };

  const activeAccounts = selectedDay ? accountsActiveOnDay(Object.values(journeys), selectedDay) : [];

  return (
    <>
      {/* Hero metrics */}
      <div className="growth-hero">
        <div className="g-metric">
          <div className="g-metric-val" style={{ color: 'var(--blue)' }}>{summary.totalInstalls ?? '—'}</div>
          <div className="g-metric-lbl">Installs</div>
          <div className="g-metric-delta delta-neutral">
            {summary.unlinkedMachines != null ? `${summary.unlinkedMachines} not signed in` : 'machines ever seen'}
          </div>
        </div>
        <div className="g-metric">
          <div className="g-metric-val" style={{ color: 'var(--accent)' }}>{summary.totalRegisteredUsers}</div>
          <div className="g-metric-lbl">Registered Users</div>
          <div className="g-metric-delta delta-up">↑ {newUsers} in last 30d</div>
        </div>
        <div className="g-metric">
          <div className="g-metric-val" style={{ color: actRate == null ? 'var(--muted)' : actRate >= 60 ? 'var(--green)' : actRate >= 30 ? 'var(--amber)' : 'var(--red)' }}>{actPct}</div>
          <div className="g-metric-lbl">Activation Rate</div>
          <div className="g-metric-delta delta-neutral">{summary.activatedUsers}/{summary.totalRegisteredUsers} activated</div>
        </div>
        <div className="g-metric">
          <div className="g-metric-val" style={{ color: 'var(--green)' }}>{d1Pct}</div>
          <div className="g-metric-lbl">D1 Retention</div>
          <div className="g-metric-delta delta-neutral" title="Computed over users whose D1 window matured AND has data — see retention funnel">
            {retentionSub(retention.d1)}
          </div>
        </div>
        <div className="g-metric">
          <div className="g-metric-val" style={{ color: d7Color }}>{d7Pct}</div>
          <div className="g-metric-lbl">D7 Retention</div>
          <div className="g-metric-delta delta-neutral" title="Computed over users whose D7 window matured AND has data — see retention funnel">
            {retentionSub(retention.d7)}
          </div>
        </div>
        <div className="g-metric">
          <div className="g-metric-val" style={{ color: 'var(--blue)' }}>{todayDau}</div>
          <div className="g-metric-lbl">Active Today</div>
          <div className="g-metric-delta delta-up">
            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>

      {/* Adoption funnel: installs → reporting → registered → activated */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Adoption Funnel</div>
            <div className="card-sub">
              Installs → Reporting (48h) → Registered → Activated · activity data before 10 Jun 2026 may be inflated (agent bug, fixed in 1.2.82)
            </div>
          </div>
          {summary.installToRegistrationRatePct != null && (
            <span className="card-tag tag-accent">{summary.installToRegistrationRatePct.toFixed(0)}% install → signup</span>
          )}
        </div>
        <div className="card-body">
          <div style={{ padding: '8px 0' }}>
            {(() => {
              const installs = summary.totalInstalls ?? 0;
              const stages = [
                { label: 'Installed', value: installs, color: 'var(--blue)', fillClass: 'prog-fill-accent' },
                { label: 'Reporting (48h)', value: summary.reportingMachines48h ?? 0, color: 'var(--accent)', fillClass: 'prog-fill-accent' },
                { label: 'Registered', value: summary.totalRegisteredUsers, color: 'var(--green)', fillClass: 'prog-fill-green' },
                { label: 'Activated', value: summary.activatedUsers, color: 'var(--green)', fillClass: 'prog-fill-green' }
              ];
              const base = Math.max(1, installs, summary.totalRegisteredUsers);
              return stages.map((stage, index) => {
                const prev = index > 0 ? stages[index - 1]!.value : null;
                const conversion = prev != null && prev > 0
                  ? ` · ${Math.round((stage.value / prev) * 100)}% of previous`
                  : '';
                return (
                  <div key={stage.label} style={{ marginBottom: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--muted2)' }}>{stage.label}{conversion}</span>
                      <span style={{ fontFamily: 'var(--font-m)', fontSize: '12px', color: stage.color }}>{stage.value}</span>
                    </div>
                    <div className="prog-track" style={{ height: '10px' }}>
                      <div className={`prog-fill ${stage.fillClass}`} style={{ width: `${Math.min(100, (stage.value / base) * 100)}%` }} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Registrations — Last 30 Days</div>
              <div className="card-sub">{newUsers} new in window</div>
            </div>
            <span className="card-tag tag-accent">+{newUsers}</span>
          </div>
          <div className="card-body">
            <RegistrationChart series={regSeries} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Daily Active Users</div>
              <div className="card-sub">Account-active-day facts · click a day for detail</div>
            </div>
            <span className="card-tag tag-green">{todayDau} today</span>
          </div>
          <div className="card-body">
            <DauChart
              series={dauSeries}
              selectedDay={selectedDay}
              onSelectDay={handleSelectDay}
            />
            {selectedDay && (
              <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>
                    Active on {shortDate(selectedDay)}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--font-m)' }}>
                    {journeysLoaded ? `${activeAccounts.length} of ${Object.keys(journeys).length} known accounts` : ''}
                  </span>
                </div>
                {journeysLoading && (
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Loading account journeys…</div>
                )}
                {journeysLoaded && activeAccounts.length === 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    No known account shows activity on this day. The series may include accounts not linked to any machine in the current fleet.
                  </div>
                )}
                {journeysLoaded && activeAccounts.map((j) => {
                  const info = accountInfo.get(j.accountId);
                  return (
                    <div key={j.accountId} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text)' }}>{info?.label ?? j.accountId}</div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--font-m)' }}>
                          {info ? info.machines.join(', ') : 'no machine in current fleet'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-m)', fontSize: '10px', color: 'var(--muted)' }}>
                        <div>{j.activeDays.length} active day{j.activeDays.length === 1 ? '' : 's'} total</div>
                        {j.registrationAtUtc && <div>registered {shortDate(j.registrationAtUtc)}</div>}
                      </div>
                    </div>
                  );
                })}
                {journeysLoaded && (
                  <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '6px', fontFamily: 'var(--font-m)' }}>
                    Resolved via the journeys of accounts linked to machines in the current fleet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Retention row */}
      <div className="grid-1-2">
        {/* Retention funnel */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Retention Funnel</div>
              <div className="card-sub">From cohort windows · retained/eligible shown</div>
            </div>
          </div>
          <div className="card-body">
            <div style={{ padding: '8px 0' }}>
              {[
                {
                  label: 'Registered',
                  pct: 100,
                  color: 'var(--accent)',
                  fillClass: 'prog-fill-accent',
                  display: String(summary.totalRegisteredUsers),
                  warn: null as string | null
                },
                ...([
                  { label: 'D1 Retained', agg: retention.d1, color: 'var(--green)', fillClass: 'prog-fill-green' },
                  { label: 'D7 Retained', agg: retention.d7, color: d7Color, fillClass: 'prog-fill-amber' },
                  { label: 'D30 Retained', agg: retention.d30, color: 'var(--muted)', fillClass: '' }
                ].map(({ label, agg, color, fillClass }) => ({
                  label,
                  pct: agg.pct ?? 0,
                  color,
                  fillClass,
                  display: agg.pct != null ? `${agg.pct.toFixed(1)}% · ${agg.retained}/${agg.eligible}` : (agg.pendingUsers > 0 ? 'Maturing' : 'No data'),
                  warn: agg.missingUsers > 0 ? `${agg.missingUsers} user${agg.missingUsers === 1 ? '' : 's'} excluded — no server data for this window` : null
                })))
              ].map(({ label, pct, color, fillClass, display, warn }) => (
                <div key={label} style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted2)' }}>
                      {label}
                      {warn && (
                        <span title={warn} style={{ color: 'var(--amber)', marginLeft: '6px', cursor: 'help' }}>⚠</span>
                      )}
                    </span>
                    <span style={{ fontFamily: 'var(--font-m)', fontSize: '12px', color }}>{display}</span>
                  </div>
                  <div className="prog-track" style={{ height: '10px' }}>
                    <div
                      className={`prog-fill ${fillClass}`}
                      style={{ width: `${Math.min(100, pct)}%`, ...(fillClass === '' ? { background: 'var(--muted)', opacity: 0.3 } : {}) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cohort retention table */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Cohort Retention Table</div>
              <div className="card-sub">By registration date · pending cells unlock as windows mature</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {!cohorts || cohorts.rows.length === 0 ? (
              <div className="empty-state">
                <p>No cohort data yet.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th>Registered</th>
                    <th>Activated</th>
                    <th style={{ textAlign: 'center' }}>D1</th>
                    <th style={{ textAlign: 'center' }}>D7</th>
                    <th style={{ textAlign: 'center' }}>D30</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.rows.map((row) => {
                    const retColor = (pct: number) =>
                      pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';

                    return (
                      <tr key={row.cohortDate}>
                        <td className="td-main">{row.cohortDate}</td>
                        <td>{row.registeredUsers}</td>
                        <td style={{ color: 'var(--green)' }}>{row.activatedUsers}</td>
                        {[1, 7, 30].map((day) => {
                          const cell = cohortCellState(row, day);
                          if (cell.kind === 'pending') {
                            return (
                              <td key={day} className="ret-cell">
                                <div className="ret-na" title="This retention window has not matured yet">pending</div>
                              </td>
                            );
                          }
                          if (cell.kind === 'nodata') {
                            return (
                              <td key={day} className="ret-cell">
                                <div
                                  className="ret-na"
                                  title="Window matured but the control plane returned no data for this cohort"
                                  style={{ color: 'var(--amber)', cursor: 'help' }}
                                >
                                  no data
                                </div>
                              </td>
                            );
                          }
                          return (
                            <td key={day} className="ret-cell">
                              <div className="ret-val" style={{ color: retColor(cell.pct) }}>
                                {cell.pct.toFixed(1)}%
                              </div>
                              <div className="ret-sub">{cell.retained}/{cell.eligible}</div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
