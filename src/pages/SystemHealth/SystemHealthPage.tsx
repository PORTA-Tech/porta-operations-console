import { Panel } from '../../components/Layout/Panel';
import { useSystemHealthLayer } from '../../hooks/useSystemHealthLayer';
import type { SystemHealthStatus } from '../../types/systemHealth';
import { formatUtc } from '../../utils/date';

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

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading system health truth...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {notices.map((notice) => (
        <div key={notice} className="operations-warning-banner">
          {notice}
        </div>
      ))}
      <Panel title="System Health">
        {records.length === 0 ? (
          <p className="muted-line">
            No machine health rows are available. System Health cannot render operational truth until the backend supplies machine, session, and activity health data to the console.
          </p>
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
