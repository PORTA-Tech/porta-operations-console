import { Panel } from '../../components/Layout/Panel';
import { SummaryBand } from '../../components/Layout/SummaryBand';
import { useMachineSummaryFeed } from '../../hooks/useMachineSummaryFeed';
import type { MachineSummaryReport } from '../../api/machines';
import { formatRelativeFromNow } from '../../utils/date';

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function stateLabel(kind: MachineSummaryReport['attentionSegmentKind'] | null | undefined): string {
  switch (kind) {
    case 'focus': return 'FOCUSED';
    case 'context_excursion': return 'CONTEXT SWITCH';
    case 'off_task_distraction': return 'DISTRACTED';
    case 'fragmentation_distraction': return 'FRAGMENTED';
    case 'away': return 'AWAY';
    default: return 'UNKNOWN';
  }
}

function stateLabelClass(kind: MachineSummaryReport['attentionSegmentKind'] | null | undefined): string {
  switch (kind) {
    case 'focus': return 'machine-state-label state-focus';
    case 'context_excursion': return 'machine-state-label state-context';
    case 'off_task_distraction':
    case 'fragmentation_distraction': return 'machine-state-label state-distracted';
    case 'away': return 'machine-state-label state-away';
    default: return 'machine-state-label state-away';
  }
}

function MachineStateCard({ row }: { row: MachineSummaryReport }) {
  const pressure = row.pressureLevel != null ? `${Math.round(row.pressureLevel * 100)}%` : '—';
  const showBreak = Boolean(row.breakPendingKind);
  const showLearning = row.calibrationStage === 'provisional';
  const showWarmup = row.calibrationStage === 'cold';

  return (
    <article
      className="machine-state-card"
      data-state={row.attentionSegmentKind ?? 'away'}
    >
      <div className="machine-state-card-head">
        <div>
          <strong className="machine-state-name">{row.machineName}</strong>
          <div className="machine-state-user">{row.userName}</div>
        </div>
        <span className={stateLabelClass(row.attentionSegmentKind)}>
          {stateLabel(row.attentionSegmentKind)}
        </span>
      </div>

      <div className="machine-state-stats">
        <div className="machine-state-stat">
          <span className="machine-state-stat-label">In state</span>
          <span className="machine-state-stat-value">{formatDuration(row.attentionSegmentSeconds)}</span>
        </div>
        <div className="machine-state-stat">
          <span className="machine-state-stat-label">Focus today</span>
          <span className="machine-state-stat-value">{formatDuration(row.focusEpisodeSeconds)}</span>
        </div>
        <div className="machine-state-stat">
          <span className="machine-state-stat-label">Pressure</span>
          <span className="machine-state-stat-value">{pressure}</span>
        </div>
        <div className="machine-state-stat">
          <span className="machine-state-stat-label">Updated</span>
          <span className="machine-state-stat-value">{formatRelativeFromNow(row.reportedAtUtc)}</span>
        </div>
      </div>

      {(showBreak || showLearning || showWarmup) ? (
        <div className="machine-state-badges">
          {showBreak ? <span className="status-badge warn">Break suggested</span> : null}
          {showLearning ? <span className="status-badge neutral">Learning</span> : null}
          {showWarmup ? <span className="status-badge neutral">Warming up</span> : null}
        </div>
      ) : null}
    </article>
  );
}

export function UserActivityPage() {
  const { rows, loading, error, lastRefreshUtc } = useMachineSummaryFeed();

  const activeCount = rows.filter((r) => r.activityDetected).length;
  const focusCount = rows.filter((r) => r.attentionSegmentKind === 'focus').length;
  const distractedCount = rows.filter((r) => r.distractionEpisodeActive).length;
  const breakCount = rows.filter((r) => r.breakNeeded).length;

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading activity state...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}

      <SummaryBand
        title="Live fleet state"
        subtitle="Real-time attention, focus, distraction, and break state across all reporting Ari agents."
        items={[
          {
            label: 'Active right now',
            value: String(activeCount),
            meta: activeCount === 1 ? 'Machine with activity detected' : 'Machines with activity detected',
            tone: activeCount > 0 ? 'ok' : 'neutral'
          },
          {
            label: 'In focus',
            value: String(focusCount),
            meta: focusCount === 1 ? 'Machine in focused work' : 'Machines in focused work',
            tone: focusCount > 0 ? 'focus' : 'neutral'
          },
          {
            label: 'Distracted',
            value: String(distractedCount),
            meta: distractedCount === 1 ? 'Machine in distraction episode' : 'Machines in distraction episode',
            tone: distractedCount > 0 ? 'critical' : 'neutral'
          },
          {
            label: 'Break ready',
            value: String(breakCount),
            meta: breakCount === 1 ? 'Machine ready for a break' : 'Machines ready for a break',
            tone: breakCount > 0 ? 'warn' : 'neutral'
          }
        ]}
      />

      <Panel
        title="Machine states"
        subtitle={lastRefreshUtc ? `Updated ${formatRelativeFromNow(lastRefreshUtc)} · polls every 5s` : 'Waiting for machine data'}
      >
        {rows.length === 0 ? (
          <div className="empty-state">
            <p className="muted-line">
              No machines are reporting. User Activity shows live attention and focus state once Ari agents start sending telemetry.
            </p>
          </div>
        ) : (
          <div className="machine-state-grid">
            {rows.map((row) => (
              <MachineStateCard key={row.machineId} row={row} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
