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
  const feedRecords = records.slice(0, 12);

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
        subtitle="Historical operator-visible suggestions and automatic changes. This feed is not the same as the current Break Needed state."
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
      <Panel
        title="Action feed"
        subtitle="Historical regulation events collapsed to one user-visible row per suggestion or automatic change."
      >
        {records.length === 0 ? (
          <div className="empty-state">
            <p className="muted-line">
              No terminal action rows are available. Actions only shows suggestions and automatic changes with authoritative completion or failure truth.
            </p>
          </div>
        ) : (
          <>
            <div className="actions-feed" aria-label="Recent regulation events">
              {feedRecords.map((record) => (
                <article key={`feed-${record.id}`} className="actions-feed-item" data-result={record.result}>
                  <div className="actions-feed-time">
                    <strong>{formatRelativeFromNow(record.timeUtc ?? undefined)}</strong>
                    <span>{formatUtc(record.timeUtc ?? undefined)}</span>
                  </div>
                  <div className="actions-feed-body">
                    <div className="actions-feed-title-row">
                      <strong className="actions-feed-title">{record.actionName}</strong>
                      <div className="actions-feed-badges">
                        <span className={actionTypeBadgeClass(record.actionType)}>{record.actionType}</span>
                        <span className={resultBadgeClass(record.result)}>{record.result}</span>
                      </div>
                    </div>
                    <div className="actions-feed-meta">
                      <span>{record.machineName}</span>
                      <span>{record.userName}</span>
                      {record.userDetail ? <span>{record.userDetail}</span> : null}
                      {record.orgRole ? <span>{record.orgRole}</span> : null}
                    </div>
                    {record.result === 'Failed' && record.errorMessage ? (
                      <p className="actions-feed-error">{record.errorMessage}</p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
