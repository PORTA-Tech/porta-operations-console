import { useEffect, useMemo, useState } from 'react';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { fetchMachineUptime, type UptimeSample } from '../../api/machines';
import { relativeTime, getLastSevenUtcDays } from '../../utils/console';
import {
  countActiveDays,
  hasMeaningfulCalibration,
  machinePresence
} from '../../utils/fleetTruth';

// Bar fill is a coarse stage indicator, NOT a measured percentage — the value
// column shows the stage name. The old page printed invented numbers (55%)
// that implied measured calibration progress where none exists.
const STAGE_FILL: Record<string, number> = { calibrated: 100, provisional: 55, cold: 8 };

export function TrustLevelPage() {
  const { rows } = useMachineSummaryFeed();
  const [allUptimeData, setAllUptimeData] = useState<Record<string, UptimeSample[]>>({});
  const dayKeys = useMemo(() => getLastSevenUtcDays().map((d) => d.key), []);

  // Same throttled pattern as System Health: fetch when the machine list
  // changes + slow timer, never on every 5s summary poll.
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

  const meaningfulRows = rows.filter(hasMeaningfulCalibration);
  const calibratedCount = meaningfulRows.filter((r) => r.calibrationStage === 'calibrated').length;
  const provisionalCount = meaningfulRows.filter((r) => r.calibrationStage === 'provisional').length;
  const coldCount = meaningfulRows.filter((r) => r.calibrationStage === 'cold').length;
  const stalledCount = rows.length - meaningfulRows.length;

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
          <div className="fc-label">Stalled / Offline</div>
          <div className="fc-val accent">{stalledCount}</div>
          <div className="fc-sub">Not collecting data · {rows.length} in fleet</div>
        </div>
      </div>

      {/* Calibration progress bars */}
      <div className="card section-mb">
        <div className="card-header">
          <div>
            <div className="card-title">Calibration Progress</div>
            <div className="card-sub">Per-machine stage toward baseline readiness</div>
          </div>
        </div>
        <div className="card-body">
          {rows.length === 0 ? (
            <div className="empty-state">
              <p>No machines reporting.</p>
            </div>
          ) : (
            rows.map((r) => {
              const meaningful = hasMeaningfulCalibration(r);
              const fill = !meaningful ? 0 : (STAGE_FILL[r.calibrationStage] ?? 0);
              const fillClass = !meaningful ? '' :
                r.calibrationStage === 'calibrated' ? 'prog-fill-green' :
                r.calibrationStage === 'provisional' ? 'prog-fill-amber' : '';
              const fillStyle =
                !meaningful || r.calibrationStage === 'cold'
                  ? { background: 'var(--muted)', opacity: 0.4 as const }
                  : {};
              const valueLabel = !meaningful
                ? (machinePresence(r) === 'offline' ? 'offline' : 'no data')
                : r.calibrationStage === 'calibrated' ? 'Calibrated' :
                  r.calibrationStage === 'provisional' ? 'Learning' :
                  'Warming up';
              return (
                <div className="prog-row" key={r.machineId}>
                  <div className="prog-label" style={{ fontFamily: 'var(--font-m)', fontSize: '11px', opacity: meaningful ? 1 : 0.55 }}>
                    {r.machineName}
                  </div>
                  <div className="prog-track" style={{ height: '8px' }}>
                    <div className={`prog-fill ${fillClass}`} style={{ width: `${Math.max(fill, 1)}%`, ...fillStyle }} />
                  </div>
                  <div className="prog-val" style={{ color: meaningful ? undefined : 'var(--muted)', minWidth: '74px' }}>
                    {valueLabel}
                  </div>
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
                <th>Active Days (7d)</th>
                <th>Last Reported</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meaningful = hasMeaningfulCalibration(r);
                const stageColor = !meaningful ? 'var(--muted)' :
                  r.calibrationStage === 'calibrated' ? 'var(--green)' :
                  r.calibrationStage === 'provisional' ? 'var(--amber)' :
                  'var(--muted)';
                const stageLabel = !meaningful
                  ? (machinePresence(r) === 'offline' ? 'Offline' : 'No data yet')
                  : r.calibrationStage === 'calibrated' ? 'Calibrated' :
                    r.calibrationStage === 'provisional' ? 'Learning' :
                    'Warming up';
                const activeDays = countActiveDays(allUptimeData[r.machineId] ?? [], dayKeys);
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
                    <td
                      title={meaningful ? undefined : 'Trust tier from the last report is stale while the machine is not collecting data'}
                      style={{
                        fontFamily: 'var(--font-m)',
                        fontSize: '11px',
                        color: meaningful && r.trustTier === 'high' ? 'var(--green)' : 'var(--muted)',
                        cursor: meaningful ? undefined : 'help'
                      }}
                    >
                      {meaningful ? r.trustTier : '—'}
                    </td>
                    <td
                      title={activeDays === null ? 'No uptime samples recorded for this machine' : 'Days with captured activity in the last 7 (UTC)'}
                      style={{ fontFamily: 'var(--font-m)', fontSize: '11px', cursor: 'help' }}
                    >
                      {activeDays === null ? '—' : `${activeDays}/7`}
                    </td>
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
