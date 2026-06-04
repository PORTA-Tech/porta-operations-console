import { useMemo } from 'react';
import { useMachineActionFeed } from '../../hooks/useMachineActionFeed';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { relativeTime } from '../../utils/console';

function formatActionLabel(action: string): string {
  return action.replace(/_/g, ' ');
}

export function ActionsPage() {
  const actionsFeed = useMachineActionFeed(200);
  const summaryFeed = useMachineSummaryFeed();

  const machineNames = useMemo(
    () => new Map(summaryFeed.rows.map((r) => [r.machineId, r.machineName])),
    [summaryFeed.rows]
  );

  const events = actionsFeed.rows;
  const totalCount = events.length;
  const totalBadge = totalCount >= 200 ? '200+' : String(totalCount);

  const appliedCount = events.filter((e) => e.executionState === 'applied' || e.executionState === 'verified').length;
  const appliedPct = totalCount > 0 ? Math.round((appliedCount / totalCount) * 100) : 0;

  const focusModeCount = events.filter(
    (e) => e.action === 'focus_mode_enabled' || e.action === 'deep_work_active'
  ).length;

  const overloadCount = events.filter(
    (e) => e.action === 'inform_overload_risk' || e.actionCategory === ('overload' as unknown as typeof e.actionCategory)
  ).length;

  const timeline = events.slice(0, 20);
  const breakSuggestions = events.filter(
    (e) => e.action === 'stretch_break_suggestion' || e.action === 'break_suggestion'
  ).slice(0, 10);

  return (
    <>
      {/* Fleet strip */}
      <div className="fleet-strip">
        <div className="fleet-card c-accent">
          <div className="fc-label">Total Actions</div>
          <div className="fc-val accent">{totalBadge}</div>
          <div className="fc-sub">Last 200 fetched</div>
        </div>
        <div className="fleet-card c-green">
          <div className="fc-label">Applied</div>
          <div className="fc-val green">~{appliedPct}%</div>
          <div className="fc-sub">Executed by agent</div>
        </div>
        <div className="fleet-card c-blue">
          <div className="fc-label">Focus Mode</div>
          <div className="fc-val blue">{focusModeCount}</div>
          <div className="fc-sub">Enabled today</div>
        </div>
        <div className="fleet-card c-amber">
          <div className="fc-label">Overload Alerts</div>
          <div className="fc-val amber">{overloadCount}</div>
          <div className="fc-sub">Risk warnings sent</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Action Timeline */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Action Timeline</div>
              <div className="card-sub">Last 20 Ari decisions — what was decided vs applied</div>
            </div>
            <span className="card-tag tag-accent">Live</span>
          </div>
          <div className="card-body">
            {timeline.length === 0 ? (
              <div className="empty-state">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, margin: '0 auto' }}>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <p>No action events yet.<br />Ari will log them here once triggered.</p>
              </div>
            ) : (
              timeline.map((e, i) => {
                const isApplied = e.executionState === 'applied' || e.executionState === 'verified' || e.executionState === 'overlay_completed';
                return (
                  <div className="action-row" key={`${e.interventionId}:${e.executionState}:${i}`}>
                    <div className="action-time">{relativeTime(e.timestampUtc)}</div>
                    <div className="action-machine">{machineNames.get(e.machineId) ?? e.machineId}</div>
                    <div className="action-label">{formatActionLabel(e.action)}</div>
                    <div className={`action-status ${isApplied ? 'as-applied' : 'as-decided'}`}>
                      {isApplied ? 'applied' : e.executionState.replace(/_/g, ' ')}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Break Suggestions */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Break Suggestions Log</div>
              <div className="card-sub">Last 10 break suggestions with acknowledgement</div>
            </div>
          </div>
          <div className="card-body">
            {breakSuggestions.length === 0 ? (
              <div className="empty-state">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, margin: '0 auto' }}>
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                </svg>
                <p>No break suggestions sent yet.<br />Ari will log them here once triggered.</p>
              </div>
            ) : (
              breakSuggestions.map((e, i) => {
                const isApplied = e.executionState === 'applied' || e.executionState === 'verified';
                return (
                  <div className="action-row" key={`break:${e.interventionId}:${i}`}>
                    <div className="action-time">{relativeTime(e.timestampUtc)}</div>
                    <div className="action-machine">{machineNames.get(e.machineId) ?? e.machineId}</div>
                    <div className="action-label">{formatActionLabel(e.action)}</div>
                    <div className={`action-status ${isApplied ? 'as-applied' : 'as-decided'}`}>
                      {isApplied ? 'applied' : 'pending'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
