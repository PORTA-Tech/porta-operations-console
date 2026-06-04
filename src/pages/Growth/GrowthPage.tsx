import { useGrowthDashboard } from '../../hooks/useGrowthDashboard';
import type { GrowthSeries } from '../../api/growth';

// ─── REGISTRATION BAR CHART ──────────────────────────────────────────────────

function RegistrationChart({ series }: { series: GrowthSeries | undefined }) {
  const W = 500, H = 160;
  if (!series || series.points.length === 0) {
    return (
      <svg width="100%" height="160" viewBox="0 0 500 160">
        <text x="250" y="80" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="12" fontFamily="JetBrains Mono">No data</text>
      </svg>
    );
  }

  const points = series.points.slice(-30);
  const n = points.length;
  const dw = W / n;
  const maxH = H - 30;

  return (
    <svg width="100%" height="160" viewBox={`0 0 ${W} ${H}`}>
      {points.map((p, i) => {
        const x = i * dw + dw * 0.15;
        const bw = dw * 0.7;
        const bh = p.value === 0 ? 3 : maxH * 0.7;
        const y = H - 20 - bh;
        const col = p.value > 0 ? 'rgba(200,255,71,0.85)' : 'rgba(255,255,255,0.04)';
        return (
          <g key={p.bucketStartUtc}>
            <rect x={x} y={y} width={bw} height={bh} rx="3" fill={col} />
            {p.value > 0 && (
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fill="rgba(200,255,71,0.9)" fontSize="10" fontFamily="JetBrains Mono">+{p.value}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function regDateLabels(series: GrowthSeries | undefined): string[] {
  if (!series) return [];
  return series.points
    .filter((p) => p.value > 0)
    .map((p) => new Date(p.bucketStartUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))
    .slice(-6);
}

// ─── DAU LINE/AREA CHART ─────────────────────────────────────────────────────

function DauChart({ series }: { series: GrowthSeries | undefined }) {
  const W = 500, H = 160;
  if (!series || series.points.length === 0) {
    return (
      <svg width="100%" height="160" viewBox="0 0 500 160">
        <text x="250" y="80" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="12" fontFamily="JetBrains Mono">No data</text>
      </svg>
    );
  }

  const pts = series.points.slice(-10);
  const n = pts.length;
  const maxY = Math.max(1, ...pts.map((p) => p.value));
  const dw = n > 1 ? W / (n - 1) : W;
  const scaleY = (v: number) => H - 30 - (v / maxY) * (H - 50);

  const coords = pts.map((p, i) => ({ x: i * dw, y: scaleY(p.value), v: p.value }));

  let linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  let areaPath = linePath + ` L${coords[coords.length - 1]!.x},${H - 20} L0,${H - 20} Z`;

  return (
    <svg width="100%" height="160" viewBox={`0 0 ${W} ${H}`}>
      {[1, 2, 3].filter((v) => v <= maxY + 1).map((v) => {
        const y = scaleY(v);
        return (
          <g key={v}>
            <line x1="0" y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <text x="4" y={y - 3} fill="rgba(255,255,255,0.2)" fontSize="9" fontFamily="JetBrains Mono">{v}</text>
          </g>
        );
      })}
      <path d={areaPath} fill="rgba(200,255,71,0.06)" />
      <path d={linePath} fill="none" stroke="rgba(200,255,71,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r="5" fill="var(--bg1)" stroke="rgba(200,255,71,0.9)" strokeWidth="2" />
          <text x={c.x} y={c.y - 10} textAnchor="middle" fill="rgba(200,255,71,0.7)" fontSize="10" fontFamily="JetBrains Mono">{c.v}</text>
        </g>
      ))}
    </svg>
  );
}

function dauDateLabels(series: GrowthSeries | undefined): string[] {
  if (!series) return [];
  return series.points
    .slice(-5)
    .map((p) => new Date(p.bucketStartUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

export function GrowthPage() {
  const { loading, error, summary, seriesByMetric, cohorts } = useGrowthDashboard();

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
  const actPct = summary.activationRatePct != null ? `${summary.activationRatePct.toFixed(1)}%` : 'n/a';

  const d7Color = summary.retentionRateD7Pct != null
    ? (summary.retentionRateD7Pct >= 80 ? 'var(--green)' : summary.retentionRateD7Pct >= 50 ? 'var(--amber)' : 'var(--red)')
    : 'var(--muted)';

  return (
    <>
      {/* Hero metrics — 5-column */}
      <div className="growth-hero">
        <div className="g-metric">
          <div className="g-metric-val" style={{ color: 'var(--accent)' }}>{summary.totalRegisteredUsers}</div>
          <div className="g-metric-lbl">Registered Users</div>
          <div className="g-metric-delta delta-up">↑ {newUsers} in last 30d</div>
        </div>
        <div className="g-metric">
          <div className="g-metric-val" style={{ color: 'var(--green)' }}>{actPct}</div>
          <div className="g-metric-lbl">Activation Rate</div>
          <div className="g-metric-delta delta-up">{summary.activatedUsers}/{summary.totalRegisteredUsers} activated</div>
        </div>
        <div className="g-metric">
          <div className="g-metric-val" style={{ color: 'var(--green)' }}>{d1Pct}</div>
          <div className="g-metric-lbl">D1 Retention</div>
          <div className="g-metric-delta delta-up">
            {summary.retentionRateD1Pct === 100 ? 'All users returned' : `${d1Pct} returned`}
          </div>
        </div>
        <div className="g-metric">
          <div className="g-metric-val" style={{ color: d7Color }}>{d7Pct}</div>
          <div className="g-metric-lbl">D7 Retention</div>
          <div className="g-metric-delta delta-neutral">
            {summary.retentionRateD7Pct != null
              ? `${summary.retentionRateD7Pct.toFixed(1)}% retained`
              : 'Maturing'}
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
            <div className="chart-label-row">
              {regDateLabels(regSeries).map((l) => (
                <span key={l} className="chart-label">{l}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Daily Active Users</div>
              <div className="card-sub">Account-active-day facts</div>
            </div>
            <span className="card-tag tag-green">{todayDau} today</span>
          </div>
          <div className="card-body">
            <DauChart series={dauSeries} />
            <div className="chart-label-row">
              {dauDateLabels(dauSeries).map((l) => (
                <span key={l} className="chart-label">{l}</span>
              ))}
            </div>
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
              <div className="card-sub">D1 → D7 → D30</div>
            </div>
          </div>
          <div className="card-body">
            <div style={{ padding: '8px 0' }}>
              {[
                { label: 'Registered', pct: 100, color: 'var(--accent)', fillClass: 'prog-fill-accent', display: String(summary.totalRegisteredUsers) },
                { label: 'D1 Retained', pct: summary.retentionRateD1Pct ?? 0, color: 'var(--green)', fillClass: 'prog-fill-green', display: d1Pct },
                { label: 'D7 Retained', pct: summary.retentionRateD7Pct ?? 0, color: d7Color, fillClass: 'prog-fill-amber', display: d7Pct },
                { label: 'D30 Retained', pct: summary.retentionRateD30Pct ?? 0, color: 'var(--muted)', fillClass: '', display: summary.retentionRateD30Pct != null ? `${summary.retentionRateD30Pct.toFixed(1)}%` : 'Maturing' },
              ].map(({ label, pct, color, fillClass, display }) => (
                <div key={label} style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted2)' }}>{label}</span>
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
              <div className="card-sub">By registration week · cells unlock as window matures</div>
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
                    const getWindow = (day: number) => row.windows.find((w) => w.day === day);
                    const retColor = (pct: number | null) =>
                      pct == null ? 'var(--muted)' : pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';

                    return (
                      <tr key={row.cohortDate}>
                        <td className="td-main">{row.cohortDate}</td>
                        <td>{row.registeredUsers}</td>
                        <td style={{ color: 'var(--green)' }}>{row.activatedUsers}</td>
                        {[1, 7, 30].map((day) => {
                          const w = getWindow(day);
                          if (!w || w.retentionRatePct == null) {
                            return <td key={day} className="ret-cell"><div className="ret-na">n/a</div></td>;
                          }
                          return (
                            <td key={day} className="ret-cell">
                              <div className="ret-val" style={{ color: retColor(w.retentionRatePct) }}>
                                {w.retentionRatePct.toFixed(1)}%
                              </div>
                              <div className="ret-sub">{w.retainedUsers}/{w.eligibleUsers}</div>
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
