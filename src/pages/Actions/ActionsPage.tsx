import { useMemo, useState } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { useMachineActionFeed } from '../../hooks/useMachineActionFeed';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { formatRelativeFromNow } from '../../utils/date';

function formatLabel(raw: string): string {
  return raw.replace(/_/g, ' ');
}

function executionStateBadgeClass(state: string): string {
  if (state === 'verified' || state === 'overlay_completed' || state === 'applied') return 'status-badge ok';
  if (state === 'failed') return 'status-badge critical';
  if (state === 'skipped' || state === 'dismissed' || state === 'snoozed' || state === 'suppressed_by_preference') return 'status-badge neutral';
  if (state === 'overlay_started' || state === 'accepted') return 'status-badge focus';
  return 'status-badge neutral';
}

const PAGE_SIZE = 20;

export function ActionsPage() {
  const actionsFeed = useMachineActionFeed(200);
  const summaryFeed = useMachineSummaryFeed();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const machineNames = useMemo(
    () => new Map(summaryFeed.rows.map((r) => [r.machineId, r.machineName])),
    [summaryFeed.rows]
  );

  const loading = actionsFeed.loading || summaryFeed.loading;
  const error = actionsFeed.error ?? summaryFeed.error;
  const visibleRows = actionsFeed.rows.slice(0, visibleCount);
  const hasMore = actionsFeed.rows.length > visibleCount;

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading action events...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      <Panel
        title="Action timeline"
        subtitle="Raw action events from all machines in chronological order — what Ari decided, suggested, or applied."
      >
        {actionsFeed.rows.length === 0 && !loading ? (
          <div className="empty-state">
            <p className="muted-line">
              No action events yet. The timeline populates once Ari agents send action events to the control plane.
            </p>
          </div>
        ) : (
          <>
            <div className="table-scroll-wrap">
              <table className="simple-table actions-timeline-table">
                <thead>
                  <tr>
                    <th style={{ width: '110px' }}>Time</th>
                    <th>Machine</th>
                    <th>User</th>
                    <th>Action</th>
                    <th style={{ width: '160px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((event, index) => (
                    <tr
                      key={`${event.machineId}:${event.interventionId}:${event.timestampUtc}:${event.executionState}:${index}`}
                    >
                      <td>
                        <div className="actions-time">
                          <strong>{formatRelativeFromNow(event.timestampUtc)}</strong>
                        </div>
                      </td>
                      <td>{machineNames.get(event.machineId) ?? event.machineId}</td>
                      <td>{event.userName}</td>
                      <td>{formatLabel(event.action)}</td>
                      <td>
                        <span className={executionStateBadgeClass(event.executionState)}>
                          {formatLabel(event.executionState)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore ? (
              <div className="actions-load-more">
                <button
                  type="button"
                  className="context-action-button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  Load more ({actionsFeed.rows.length - visibleCount} remaining)
                </button>
              </div>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  );
}
