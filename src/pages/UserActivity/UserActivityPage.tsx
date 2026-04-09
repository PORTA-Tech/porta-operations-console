import { Panel } from '../../components/Layout/Panel';
import { SummaryBand } from '../../components/Layout/SummaryBand';
import { useUserActivityLayer } from '../../hooks/useUserActivityLayer';
import { formatRelativeFromNow } from '../../utils/date';
import type {
  UserActivityBreakNeeded,
  UserActivityDeepWork,
  UserActivityFocusLevel,
  UserActivityOverloadRisk
} from '../../types/userActivity';

function focusBadgeClass(value: UserActivityFocusLevel): string {
  if (value === 'High') return 'status-badge focus';
  if (value === 'Medium') return 'status-badge ok';
  if (value === 'Low') return 'status-badge neutral';
  return 'status-badge neutral';
}

function deepWorkBadgeClass(value: UserActivityDeepWork): string {
  if (value === 'Active') return 'status-badge focus';
  if (value === 'Not active') return 'status-badge neutral';
  return 'status-badge neutral';
}

function overloadBadgeClass(value: UserActivityOverloadRisk): string {
  if (value === 'High') return 'status-badge critical';
  if (value === 'Medium') return 'status-badge warn';
  if (value === 'Low') return 'status-badge ok';
  return 'status-badge warn';
}

function breakNeededBadgeClass(value: UserActivityBreakNeeded): string {
  if (value === 'Yes') return 'status-badge warn';
  if (value === 'No') return 'status-badge ok';
  return 'status-badge warn';
}

export function UserActivityPage() {
  const { records, loading, error, notices } = useUserActivityLayer();
  const focusHighCount = records.filter((record) => record.focusLevel === 'High').length;
  const deepWorkCount = records.filter((record) => record.deepWork === 'Active').length;
  const breakNeededCount = records.filter((record) => record.breakNeeded === 'Yes').length;
  const overloadHighCount = records.filter((record) => record.overloadRisk === 'High').length;
  const strongestFocus = records
    .filter((record) => record.focusDurationSec !== null)
    .sort((left, right) => (right.focusDurationSec ?? 0) - (left.focusDurationSec ?? 0))[0];
  const latestBreakReady = records
    .filter((record) => record.breakNeeded === 'Yes' && record.stateTimestampUtc)
    .sort((left, right) => Date.parse(right.stateTimestampUtc ?? '') - Date.parse(left.stateTimestampUtc ?? ''))[0];
  const latestOverload = records
    .filter((record) => record.overloadRisk === 'High' && record.stateTimestampUtc)
    .sort((left, right) => Date.parse(right.stateTimestampUtc ?? '') - Date.parse(left.stateTimestampUtc ?? ''))[0];

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
            meta: strongestFocus ? `Longest focus episode ${strongestFocus.focusDurationLabel}` : (focusHighCount === 1 ? 'Machine in strong focus episode' : 'Machines in strong focus episodes'),
            tone: focusHighCount > 0 ? 'focus' : 'neutral'
          },
          {
            label: 'Deep work active',
            value: String(deepWorkCount),
            meta: strongestFocus && deepWorkCount > 0 ? `Active for up to ${strongestFocus.focusDurationLabel}` : (deepWorkCount === 1 ? 'Protected focus episode' : 'Protected focus episodes'),
            tone: deepWorkCount > 0 ? 'focus' : 'neutral'
          },
          {
            label: 'Break ready',
            value: String(breakNeededCount),
            meta: latestBreakReady?.stateTimestampUtc ? `Break ready ${formatRelativeFromNow(latestBreakReady.stateTimestampUtc)}` : (breakNeededCount === 1 ? 'Machine ready for a short or long break' : 'Machines ready for short or long breaks'),
            tone: breakNeededCount > 0 ? 'warn' : 'neutral'
          },
          {
            label: 'Pressure high',
            value: String(overloadHighCount),
            meta: latestOverload?.stateTimestampUtc ? `Observed ${formatRelativeFromNow(latestOverload.stateTimestampUtc)}` : (overloadHighCount === 1 ? 'Machine in elevated pressure' : 'Machines in elevated pressure'),
            tone: overloadHighCount > 0 ? 'critical' : 'neutral'
          }
        ]}
      />
      <Panel
        title="Behavior detail"
        subtitle="Supporting machine-level activity truth beneath the live focus, pressure, and regulation summary."
      >
        {records.length === 0 ? (
          <div className="empty-state">
            <p className="muted-line">
              No user-activity rows are available. User Activity cannot render current behavioral truth until the backend supplies focus-episode, deep-work, pressure, and break-readiness state.
            </p>
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table className="simple-table user-activity-table">
              <thead>
                <tr>
                  <th>Machine / User</th>
                  <th>Focus level</th>
                  <th>Deep work</th>
                  <th>Pressure</th>
                  <th>Focus episode</th>
                  <th>Break ready</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.machineId} className="user-activity-row" data-tone={record.tone}>
                    <td>
                      <div className="user-activity-context">
                        <strong>{record.machineName}</strong>
                        <span className="user-activity-user">{record.userName}</span>
                        {record.userDetail ? <span className="user-activity-user">{record.userDetail}</span> : null}
                        {record.orgRole ? <span className="user-activity-note">{record.orgRole}</span> : null}
                        <span className="user-activity-note">
                          {record.stateTimestampUtc ? `Updated ${formatRelativeFromNow(record.stateTimestampUtc)}` : 'Update time unavailable'}
                        </span>
                        {record.note ? <span className="user-activity-note">{record.note}</span> : null}
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
                      <div className="user-activity-context">
                        <span className={record.stateStale ? 'system-health-time stale' : 'system-health-time'}>
                          {record.focusDurationLabel}
                        </span>
                        {record.stateTimestampUtc ? (
                          <span className="user-activity-note">
                            State {formatRelativeFromNow(record.stateTimestampUtc)}
                          </span>
                        ) : null}
                        {record.activityReason ? (
                          <span className="user-activity-note">
                            {record.activityReason}
                          </span>
                        ) : null}
                      </div>
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
