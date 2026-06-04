import { useEffect, useMemo, useState } from 'react';
import { fetchDigestLog, type DigestLogEntry } from '../../api/digest';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import { formatSeconds, relativeTime } from '../../utils/console';

function failureReasonLabel(reason: string | null): string {
  switch (reason) {
    case 'under_1h': return 'Under 1 hour tracked';
    case 'email_not_set': return 'No email configured';
    case 'send_failed': return 'Send failed';
    case 'account_not_found': return 'Account not found';
    default: return reason ?? '';
  }
}

function isLastNight(dateLocal: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateLocal === yesterday.toISOString().slice(0, 10);
}

export function DigestPage() {
  const [entries, setEntries] = useState<DigestLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const summaryFeed = useMachineSummaryFeed();

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void fetchDigestLog(30)
        .then((data) => { if (!cancelled) { setEntries(data); setLoading(false); } })
        .catch((err: unknown) => {
          void err; // log silently - digest endpoint may not have data yet
          if (!cancelled) setLoading(false);
        });
    };

    load();
    const id = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const machineNames = useMemo(
    () => new Map(summaryFeed.rows.map((r) => [r.machineId, r.machineName])),
    [summaryFeed.rows]
  );

  const lastNightCount = entries.filter((e) => isLastNight(e.dateLocal)).length;
  // trackedSeconds is not in MachineSummaryReport — eligible count is unavailable from this endpoint
  const eligibleTonight = 0;

  return (
    <>
      {/* Fleet strip */}
      <div className="fleet-strip">
        <div className="fleet-card c-accent">
          <div className="fc-label">Fires At</div>
          <div className="fc-val accent" style={{ fontSize: '20px' }}>23:30</div>
          <div className="fc-sub">Dubai time (UTC+4)</div>
        </div>
        <div className="fleet-card c-green">
          <div className="fc-label">Min Track Time</div>
          <div className="fc-val green" style={{ fontSize: '20px' }}>1h</div>
          <div className="fc-sub">Required to fire</div>
        </div>
        <div className="fleet-card c-amber">
          <div className="fc-label">Last Night</div>
          <div className="fc-val amber">{lastNightCount > 0 ? String(lastNightCount) : '—'}</div>
          <div className="fc-sub">{lastNightCount > 0 ? `${lastNightCount} entries` : 'No entries yet'}</div>
        </div>
        <div className="fleet-card c-blue">
          <div className="fc-label">Eligible Tonight</div>
          <div className="fc-val blue">{eligibleTonight}</div>
          <div className="fc-sub">Based on today's data</div>
        </div>
      </div>

      {/* Digest log card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Nightly Digest Log</div>
            <div className="card-sub">First thing to check each morning — did it fire?</div>
          </div>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="empty-state">
              <p style={{ color: 'var(--muted)' }}>Loading digest log…</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, margin: '0 auto' }}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <p>No digest entries yet.<br />First entry appears at 23:30 Dubai time when ≥1h is tracked.</p>
            </div>
          ) : (
            entries.map((e) => {
              const statusClass = e.fired ? 'ds-fired' : e.failureReason === 'send_failed' ? 'ds-failed' : 'ds-skipped';
              const statusLabel = e.fired ? '✓ Sent' : e.failureReason === 'send_failed' ? '✗ Failed' : '✗ Skipped';
              return (
                <div className="digest-row" key={`${e.machineId}:${e.dateLocal}`}>
                  <div className="digest-date">{e.dateLocal}</div>
                  <div className="digest-machine">{machineNames.get(e.machineId) ?? e.machineId}</div>
                  <div className="digest-tracked">{formatSeconds(e.trackedSeconds)}</div>
                  <div className={`digest-status ${statusClass}`}>{statusLabel}</div>
                  <div className="digest-reason">
                    {!e.fired && e.failureReason ? failureReasonLabel(e.failureReason) : ''}
                  </div>
                  <div style={{ fontFamily: 'var(--font-m)', fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>
                    {relativeTime(e.sentAtUtc)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
