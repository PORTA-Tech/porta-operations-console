import { Panel } from '../../components/Layout/Panel';
import { SummaryBand } from '../../components/Layout/SummaryBand';
import { useSystemHealthLayer } from '../../hooks/useSystemHealthLayer';
import type { SystemHealthStatus } from '../../types/systemHealth';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

function statusClass(value: SystemHealthStatus): string {
  if (value === 'Yes') return 'status-badge ok';
  if (value === 'No') return 'status-badge critical';
  return 'status-badge warn';
}

function timeCell(valueUtc: string | null, label: string, stale: boolean) {
  const title = valueUtc ? formatUtc(valueUtc) : label;
  const className = stale ? 'system-health-time stale' : 'system-health-time';
  return (
    <span className={className} title={title}>
      {label}
    </span>
  );
}

export function SystemHealthPage() {
  const { records, loading, error, notices } = useSystemHealthLayer();
  const healthyCount = records.filter((record) => record.tone === 'healthy').length;
  const degradedCount = records.filter((record) => record.tone === 'warning').length;
  const disconnectedCount = records.filter((record) => record.agentRunning === 'No').length;
  const noActivityCount = records.filter(
    (record) => record.agentRunning === 'Yes' && record.userSessionConnected === 'Yes' && record.activityDetected !== 'Yes'
  ).length;
  const latestSeenUtc = records[0]?.lastSeenUtc ?? null;
  const latestActivityUtc = records
    .filter((record) => record.lastActivityUtc)
    .sort((left, right) => Date.parse(right.lastActivityUtc ?? '') - Date.parse(left.lastActivityUtc ?? ''))[0]?.lastActivityUtc ?? null;

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading system health truth...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {notices.map((notice) => (
        <div key={notice} className="operations-warning-banner">
          {notice}
        </div>
      ))}
      <SummaryBand
        title="Fleet health"
        subtitle="Immediate operational truth for runtime, session, and activity ingest health."
        items={[
          {
            label: 'Healthy machines',
            value: String(healthyCount),
            meta: latestSeenUtc ? `Last seen ${formatRelativeFromNow(latestSeenUtc)}` : (healthyCount === 1 ? 'Machine fully reporting' : 'Machines fully reporting'),
            tone: 'ok'
          },
          {
            label: 'Degraded capture',
            value: String(degradedCount),
            meta: degradedCount === 1 ? 'Machine needs attention' : 'Machines need attention',
            tone: degradedCount > 0 ? 'warn' : 'neutral'
          },
          {
            label: 'Disconnected agents',
            value: String(disconnectedCount),
            meta: disconnectedCount === 1 ? 'Agent offline' : 'Agents offline',
            tone: disconnectedCount > 0 ? 'critical' : 'neutral'
          },
          {
            label: 'No live activity',
            value: String(noActivityCount),
            meta: latestActivityUtc ? `Last activity ${formatRelativeFromNow(latestActivityUtc)}` : (noActivityCount === 1 ? 'Session quiet or stalled' : 'Sessions quiet or stalled'),
            tone: noActivityCount > 0 ? 'warn' : 'neutral'
          }
        ]}
      />
      <Panel
        title="Machine detail"
        subtitle="Supporting runtime, session, and activity rows beneath the live fleet health summary."
      >
        {records.length === 0 ? (
          <div className="empty-state">
            <p className="muted-line">
              No machine health rows are available. System Health cannot render operational truth until the backend supplies machine, session, and activity health data to the console.
            </p>
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table className="simple-table system-health-table">
              <thead>
                <tr>
                  <th>Machine name</th>
                  <th>User name</th>
                  <th>Last seen time</th>
                  <th>Agent running</th>
                  <th>User session connected</th>
                  <th>Activity detected</th>
                  <th>Last activity time</th>
                  <th>Error message</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.machineId} className="system-health-row" data-tone={record.tone}>
                    <td title={record.machineId}>{record.machineName}</td>
                    <td>{record.userName}</td>
                    <td>{timeCell(record.lastSeenUtc, record.lastSeenLabel, record.lastSeenStale)}</td>
                    <td>
                      <span className={statusClass(record.agentRunning)}>{record.agentRunning}</span>
                    </td>
                    <td>
                      <span className={statusClass(record.userSessionConnected)}>{record.userSessionConnected}</span>
                    </td>
                    <td>
                      <span className={statusClass(record.activityDetected)}>{record.activityDetected}</span>
                    </td>
                    <td>{timeCell(record.lastActivityUtc, record.lastActivityLabel, record.lastActivityStale)}</td>
                    <td>{record.errorMessage ?? ''}</td>
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
