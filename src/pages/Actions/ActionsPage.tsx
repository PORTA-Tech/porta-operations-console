import { Panel } from '../../components/Layout/Panel';
import { SummaryBand } from '../../components/Layout/SummaryBand';
import { useActionsLayer } from '../../hooks/useActionsLayer';
import type { ActionsActionType, ActionsResult } from '../../types/actionsLayer';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

function actionTypeBadgeClass(value: ActionsActionType): string {
  return value === 'Automatic change' ? 'status-badge focus' : 'status-badge neutral';
}

function resultBadgeClass(value: ActionsResult): string {
  return value === 'Done' ? 'status-badge ok' : 'status-badge critical';
}

export function ActionsPage() {
  const { records, loading, error, notices } = useActionsLayer();
  const suggestionCount = records.filter((record) => record.actionType === 'Suggestion' && record.result === 'Done').length;
  const automaticChangeCount = records.filter((record) => record.actionType === 'Automatic change' && record.result === 'Done').length;
  const failedCount = records.filter((record) => record.result === 'Failed').length;
  const latestActionUtc = records[0]?.timeUtc ?? null;

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading action truth...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {notices.map((notice) => (
        <div key={notice} className="operations-warning-banner">
          {notice}
        </div>
      ))}
      <SummaryBand
        title="Regulation activity"
        subtitle="Recent operator-visible suggestions and automatic changes with authoritative outcome truth."
        items={[
          {
            label: 'Suggestions shown',
            value: String(suggestionCount),
            meta: suggestionCount === 1 ? 'Suggestion reached the user session' : 'Suggestions reached the user session',
            tone: suggestionCount > 0 ? 'focus' : 'neutral'
          },
          {
            label: 'Automatic changes',
            value: String(automaticChangeCount),
            meta: automaticChangeCount === 1 ? 'Change applied successfully' : 'Changes applied successfully',
            tone: automaticChangeCount > 0 ? 'ok' : 'neutral'
          },
          {
            label: 'Failures',
            value: String(failedCount),
            meta: failedCount === 1 ? 'Action needs operator attention' : 'Actions need operator attention',
            tone: failedCount > 0 ? 'critical' : 'neutral'
          },
          {
            label: 'Latest action',
            value: latestActionUtc ? formatRelativeFromNow(latestActionUtc) : 'No actions',
            meta: latestActionUtc ? formatUtc(latestActionUtc) : 'No recent action truth',
            tone: 'neutral'
          }
        ]}
      />
      <Panel title="Actions">
        {records.length === 0 ? (
          <p className="muted-line">
            No terminal action rows are available. Actions only shows suggestions and automatic changes with authoritative completion or failure truth.
          </p>
        ) : (
          <div className="table-scroll-wrap">
            <table className="simple-table actions-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>User</th>
                  <th>Action name</th>
                  <th>Action type</th>
                  <th>Result</th>
                  <th>Time</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="actions-row" data-result={record.result}>
                    <td>{record.machineName}</td>
                    <td>{record.userName}</td>
                    <td>{record.actionName}</td>
                    <td>
                      <span className={actionTypeBadgeClass(record.actionType)}>{record.actionType}</span>
                    </td>
                    <td>
                      <span className={resultBadgeClass(record.result)}>{record.result}</span>
                    </td>
                    <td>{formatUtc(record.timeUtc ?? undefined)}</td>
                    <td>{record.result === 'Failed' ? (record.errorMessage ?? '') : ''}</td>
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
