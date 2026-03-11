import { Panel } from '../../components/Layout/Panel';
import { SummaryBand } from '../../components/Layout/SummaryBand';
import { useUserActivityLayer } from '../../hooks/useUserActivityLayer';
import type {
  UserActivityBreakNeeded,
  UserActivityDeepWork,
  UserActivityFocusLevel,
  UserActivityOverloadRisk
} from '../../types/userActivity';

function focusBadgeClass(value: UserActivityFocusLevel): string {
  if (value === 'High') return 'status-badge critical';
  if (value === 'Medium') return 'status-badge warn';
  if (value === 'Low') return 'status-badge ok';
  return 'status-badge warn';
}

function deepWorkBadgeClass(value: UserActivityDeepWork): string {
  if (value === 'Active') return 'status-badge ok';
  if (value === 'Not active') return 'status-badge warn';
  return 'status-badge warn';
}

function overloadBadgeClass(value: UserActivityOverloadRisk): string {
  if (value === 'High') return 'status-badge critical';
  if (value === 'Medium') return 'status-badge warn';
  if (value === 'Low') return 'status-badge ok';
  return 'status-badge warn';
}

function breakNeededBadgeClass(value: UserActivityBreakNeeded): string {
  if (value === 'Yes') return 'status-badge critical';
  if (value === 'No') return 'status-badge ok';
  return 'status-badge warn';
}

export function UserActivityPage() {
  const { records, loading, error, notices } = useUserActivityLayer();
  const focusHighCount = records.filter((record) => record.focusLevel === 'High').length;
  const deepWorkCount = records.filter((record) => record.deepWork === 'Active').length;
  const breakNeededCount = records.filter((record) => record.breakNeeded === 'Yes').length;
  const overloadHighCount = records.filter((record) => record.overloadRisk === 'High').length;

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading user activity truth...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {notices.map((notice) => (
        <div key={notice} className="operations-warning-banner">
          {notice}
        </div>
      ))}
      <SummaryBand
        title="Current activity"
        subtitle="A simplified operational view of what PORTA thinks users are doing right now."
        items={[
          {
            label: 'Focus high',
            value: String(focusHighCount),
            meta: focusHighCount === 1 ? 'Machine in strong continuity' : 'Machines in strong continuity',
            tone: focusHighCount > 0 ? 'focus' : 'neutral'
          },
          {
            label: 'Deep work active',
            value: String(deepWorkCount),
            meta: deepWorkCount === 1 ? 'Protected focused session' : 'Protected focused sessions',
            tone: deepWorkCount > 0 ? 'focus' : 'neutral'
          },
          {
            label: 'Break needed',
            value: String(breakNeededCount),
            meta: breakNeededCount === 1 ? 'Machine ready for a break nudge' : 'Machines ready for break nudges',
            tone: breakNeededCount > 0 ? 'warn' : 'neutral'
          },
          {
            label: 'Overload high',
            value: String(overloadHighCount),
            meta: overloadHighCount === 1 ? 'Machine in elevated strain' : 'Machines in elevated strain',
            tone: overloadHighCount > 0 ? 'critical' : 'neutral'
          }
        ]}
      />
      <Panel title="User Activity">
        {records.length === 0 ? (
          <p className="muted-line">
            No user-activity rows are available. User Activity cannot render current behavioral truth until the backend supplies live continuity, deep-work, overload, and break-readiness state.
          </p>
        ) : (
          <div className="table-scroll-wrap">
            <table className="simple-table user-activity-table">
              <thead>
                <tr>
                  <th>Machine / User</th>
                  <th>Focus level</th>
                  <th>Deep work</th>
                  <th>Overload risk</th>
                  <th>Focus duration</th>
                  <th>Break needed</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.machineId} className="user-activity-row" data-tone={record.tone}>
                    <td>
                      <div className="user-activity-context">
                        <strong>{record.machineName}</strong>
                        <span className="user-activity-user">{record.userName}</span>
                      </div>
                    </td>
                    <td>
                      <span className={focusBadgeClass(record.focusLevel)}>{record.focusLevel}</span>
                    </td>
                    <td>
                      <span className={deepWorkBadgeClass(record.deepWork)}>{record.deepWork}</span>
                    </td>
                    <td>
                      <span className={overloadBadgeClass(record.overloadRisk)}>{record.overloadRisk}</span>
                    </td>
                    <td>
                      <span className={record.stateStale ? 'system-health-time stale' : 'system-health-time'}>
                        {record.focusDurationLabel}
                      </span>
                    </td>
                    <td>
                      <span className={breakNeededBadgeClass(record.breakNeeded)}>{record.breakNeeded}</span>
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
