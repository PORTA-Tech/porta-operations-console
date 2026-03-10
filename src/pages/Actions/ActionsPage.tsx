import { Panel } from '../../components/Layout/Panel';
import { useActionsLayer } from '../../hooks/useActionsLayer';
import type { ActionsActionType, ActionsResult } from '../../types/actionsLayer';
import { formatUtc } from '../../utils/date';

function actionTypeBadgeClass(value: ActionsActionType): string {
  return value === 'Automatic change' ? 'status-badge critical' : 'status-badge warn';
}

function resultBadgeClass(value: ActionsResult): string {
  return value === 'Done' ? 'status-badge ok' : 'status-badge critical';
}

export function ActionsPage() {
  const { records, loading, error, notices } = useActionsLayer();

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading action truth...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {notices.map((notice) => (
        <div key={notice} className="operations-warning-banner">
          {notice}
        </div>
      ))}
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
