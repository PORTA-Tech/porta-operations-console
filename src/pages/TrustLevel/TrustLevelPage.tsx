import { Panel } from '../../components/Layout/Panel';
import { SummaryBand } from '../../components/Layout/SummaryBand';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { formatRelativeFromNow } from '../../utils/date';

function calibrationBadgeClass(stage: string): string {
  if (stage === 'calibrated') return 'status-badge ok';
  if (stage === 'provisional') return 'status-badge warn';
  return 'status-badge neutral';
}

function calibrationLabel(stage: string): string {
  if (stage === 'calibrated') return 'Calibrated';
  if (stage === 'provisional') return 'Learning';
  return 'Warming up';
}

function trustTierBadgeClass(tier: string): string {
  if (tier === 'high') return 'status-badge ok';
  if (tier === 'medium') return 'status-badge warn';
  return 'status-badge neutral';
}

export function TrustLevelPage() {
  const { rows, loading, error, lastRefreshUtc } = useMachineSummaryFeed();

  const calibratedCount = rows.filter((r) => r.calibrationStage === 'calibrated').length;
  const provisionalCount = rows.filter((r) => r.calibrationStage === 'provisional').length;
  const coldCount = rows.filter((r) => r.calibrationStage === 'cold').length;

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading calibration state...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      <SummaryBand
        title="Baseline & calibration"
        subtitle="How well calibrated each Ari agent is and how much baseline trust it has earned for behavioral regulation."
        items={[
          {
            label: 'Ready',
            value: String(calibratedCount),
            meta: calibratedCount === 1 ? 'Machine fully calibrated' : 'Machines fully calibrated',
            tone: calibratedCount > 0 ? 'ok' : 'neutral'
          },
          {
            label: 'Learning',
            value: String(provisionalCount),
            meta: provisionalCount === 1 ? 'Machine building baseline' : 'Machines building baseline',
            tone: provisionalCount > 0 ? 'warn' : 'neutral'
          },
          {
            label: 'Warming up',
            value: String(coldCount),
            meta: coldCount === 1 ? 'Machine with no baseline yet' : 'Machines with no baseline yet',
            tone: coldCount > 0 ? 'warn' : 'neutral'
          },
          {
            label: 'Total machines',
            value: String(rows.length),
            meta: lastRefreshUtc ? `Updated ${formatRelativeFromNow(lastRefreshUtc)}` : 'Awaiting data',
            tone: 'neutral'
          }
        ]}
      />

      <Panel
        title="Calibration detail"
        subtitle="Per-machine calibration stage, trust tier, and last report time."
      >
        {rows.length === 0 ? (
          <div className="empty-state">
            <p className="muted-line">
              No machines are reporting. Baseline &amp; Calibration shows data once Ari agents send telemetry.
            </p>
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table className="simple-table calibration-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>User</th>
                  <th>Calibration</th>
                  <th>Trust tier</th>
                  <th>Last reported</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.machineId}>
                    <td>
                      <strong>{row.machineName}</strong>
                    </td>
                    <td>{row.userName}</td>
                    <td>
                      <span className={calibrationBadgeClass(row.calibrationStage)}>
                        {calibrationLabel(row.calibrationStage)}
                      </span>
                    </td>
                    <td>
                      <span className={trustTierBadgeClass(row.trustTier)}>
                        {row.trustTier}
                      </span>
                    </td>
                    <td>
                      <span className="system-health-time">
                        {formatRelativeFromNow(row.reportedAtUtc)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
