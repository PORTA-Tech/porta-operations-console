import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { relativeTime } from '../../utils/console';

export function TrustLevelPage() {
  const { rows } = useMachineSummaryFeed();

  const calibratedCount = rows.filter((r) => r.calibrationStage === 'calibrated').length;
  const provisionalCount = rows.filter((r) => r.calibrationStage === 'provisional').length;
  const coldCount = rows.filter((r) => r.calibrationStage === 'cold').length;

  return (
    <>
      {/* Fleet strip */}
      <div className="fleet-strip">
        <div className="fleet-card c-green">
          <div className="fc-label">Calibrated</div>
          <div className="fc-val green">{calibratedCount}</div>
          <div className="fc-sub">Fully ready</div>
        </div>
        <div className="fleet-card c-amber">
          <div className="fc-label">Learning</div>
          <div className="fc-val amber">{provisionalCount}</div>
          <div className="fc-sub">Building baseline</div>
        </div>
        <div className="fleet-card c-red">
          <div className="fc-label">Warming Up</div>
          <div className="fc-val red">{coldCount}</div>
          <div className="fc-sub">No baseline yet</div>
        </div>
        <div className="fleet-card c-accent">
          <div className="fc-label">Total Machines</div>
          <div className="fc-val accent">{rows.length}</div>
          <div className="fc-sub">In fleet</div>
        </div>
      </div>

      {/* Calibration progress bars */}
      <div className="card section-mb">
        <div className="card-header">
          <div>
            <div className="card-title">Calibration Progress</div>
            <div className="card-sub">Per-machine progress toward baseline readiness</div>
          </div>
        </div>
        <div className="card-body">
          {rows.length === 0 ? (
            <div className="empty-state">
              <p>No machines reporting.</p>
            </div>
          ) : (
            rows.map((r) => {
              const progress =
                r.calibrationStage === 'calibrated' ? 100 :
                r.calibrationStage === 'provisional' ? 55 :
                5;
              const fillClass =
                r.calibrationStage === 'calibrated' ? 'prog-fill-green' :
                r.calibrationStage === 'provisional' ? 'prog-fill-amber' : '';
              const fillStyle =
                r.calibrationStage === 'cold'
                  ? { background: 'var(--muted)', opacity: 0.4 as const }
                  : {};
              return (
                <div className="prog-row" key={r.machineId}>
                  <div className="prog-label" style={{ fontFamily: 'var(--font-m)', fontSize: '11px' }}>
                    {r.machineName}
                  </div>
                  <div className="prog-track" style={{ height: '8px' }}>
                    <div className={`prog-fill ${fillClass}`} style={{ width: `${progress}%`, ...fillStyle }} />
                  </div>
                  <div className="prog-val">{progress}%</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Calibration detail table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Calibration Detail</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Machine</th>
                <th>User</th>
                <th>Calibration Stage</th>
                <th>Trust Tier</th>
                <th>Days of Data</th>
                <th>Last Reported</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stageColor =
                  r.calibrationStage === 'calibrated' ? 'var(--green)' :
                  r.calibrationStage === 'provisional' ? 'var(--amber)' :
                  'var(--muted)';
                const stageLabel =
                  r.calibrationStage === 'calibrated' ? 'Calibrated' :
                  r.calibrationStage === 'provisional' ? 'Learning' :
                  'Warming up';
                return (
                  <tr key={r.machineId}>
                    <td className="td-main">{r.machineName}</td>
                    <td>
                      <div style={{ fontSize: '12px' }}>{r.userName}</div>
                      {r.primaryEmail && <div className="td-email">{r.primaryEmail}</div>}
                    </td>
                    <td>
                      <span style={{ color: stageColor, fontWeight: 600, fontSize: '12px' }}>
                        {stageLabel}
                      </span>
                    </td>
                    <td style={{
                      fontFamily: 'var(--font-m)',
                      fontSize: '11px',
                      color: r.trustTier === 'high' ? 'var(--green)' : 'var(--muted)',
                    }}>
                      {r.trustTier}
                    </td>
                    <td style={{ fontFamily: 'var(--font-m)', fontSize: '11px' }}>—</td>
                    <td style={{ fontFamily: 'var(--font-m)', fontSize: '11px', color: 'var(--muted)' }}>
                      {relativeTime(r.reportedAtUtc)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
