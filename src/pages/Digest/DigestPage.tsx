import { useEffect, useMemo, useState } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { toApiError, type ApiError } from '../../api/client';
import { fetchDigestLog, type DigestLogEntry } from '../../api/digest';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { formatRelativeFromNow } from '../../utils/date';

function formatTrackedTime(seconds: number): string {
  if (seconds <= 0) return '0m';
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function failureReasonLabel(reason: string | null): string {
  switch (reason) {
    case 'under_1h': return 'Under 1 hour tracked';
    case 'email_not_set': return 'No email configured';
    case 'send_failed': return 'Send failed';
    case 'account_not_found': return 'Account not found';
    default: return reason ?? '';
  }
}

export function DigestPage() {
  const [entries, setEntries] = useState<DigestLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [lastRefreshUtc, setLastRefreshUtc] = useState<string | undefined>();

  const summaryFeed = useMachineSummaryFeed();

  const machineInfo = useMemo(
    () => new Map(
      summaryFeed.rows.map((r) => [r.machineId, { machineName: r.machineName, userName: r.userName }])
    ),
    [summaryFeed.rows]
  );

  function refresh() {
    setLoading(true);
    void fetchDigestLog(30)
      .then((data) => {
        setEntries(data);
        setError(undefined);
        setLastRefreshUtc(new Date().toISOString());
      })
      .catch((err: unknown) => {
        setError(toApiError(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firedCount = entries.filter((e) => e.fired).length;
  const skippedCount = entries.filter((e) => !e.fired).length;

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading digest log...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      <Panel
        title="Nightly digest log"
        subtitle="Ari fires at 23:30 Dubai time when ≥1 hour is tracked. This is the first thing to check each morning."
      >
        <div className="digest-toolbar">
          <span className="muted-line">
            {entries.length > 0
              ? `${firedCount} sent, ${skippedCount} skipped · last ${entries.length} entries`
              : 'No digest entries yet'}
          </span>
          <button type="button" className="context-action-button" onClick={refresh} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {lastRefreshUtc ? (
            <span className="muted-line">Updated {formatRelativeFromNow(lastRefreshUtc)}</span>
          ) : null}
        </div>

        {entries.length === 0 && !loading ? (
          <div className="empty-state">
            <p className="muted-line">
              No digest entries yet. Entries appear after the first digest attempt fires or is skipped at 23:30 Dubai time.
            </p>
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table className="simple-table digest-table">
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>Date</th>
                  <th>Machine / User</th>
                  <th style={{ width: '90px' }}>Tracked</th>
                  <th style={{ width: '90px' }}>Status</th>
                  <th>Reason</th>
                  <th style={{ width: '110px' }}>Time sent</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const info = machineInfo.get(entry.machineId);
                  return (
                    <tr key={`${entry.machineId}:${entry.dateLocal}`}>
                      <td>
                        <strong>{entry.dateLocal}</strong>
                      </td>
                      <td>
                        <div className="identity-stack">
                          <strong>{info?.machineName ?? entry.machineId}</strong>
                          {info?.userName ? <span className="identity-subline">{info.userName}</span> : null}
                        </div>
                      </td>
                      <td>{formatTrackedTime(entry.trackedSeconds)}</td>
                      <td>
                        {entry.fired
                          ? <span className="digest-status-sent">✓ Sent</span>
                          : <span className="digest-status-skipped">✗ Skipped</span>}
                      </td>
                      <td>
                        {!entry.fired && entry.failureReason
                          ? <span className="digest-reason">{failureReasonLabel(entry.failureReason)}</span>
                          : null}
                      </td>
                      <td>
                        <span className="system-health-time">
                          {formatRelativeFromNow(entry.sentAtUtc)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
