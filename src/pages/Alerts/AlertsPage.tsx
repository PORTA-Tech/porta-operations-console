import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel } from '../../components/Layout/Panel';
import { useConsoleOperations } from '../../hooks/useConsoleOperations';
import { formatUtc } from '../../utils/date';
import type { AlertRecord } from '../../types/consoleOperations';

type AlertSeverityLabel = 'Info' | 'Warning' | 'Critical';
type AlertTone = 'info' | 'warn' | 'critical';
type AlertScope = 'Fleet' | 'Cohort' | 'Machine';
type AlertCategory =
  | 'agent_offline'
  | 'backend_disconnected'
  | 'signature_invalid'
  | 'config_drift'
  | 'slo_breach'
  | 'cohort_regression_spike'
  | 'policy_thrash'
  | 'circuit_breaker_open'
  | 'ws_drop_spikes';

interface AlertGroupCard {
  key: string;
  category: AlertCategory;
  severity: AlertSeverityLabel;
  tone: AlertTone;
  scope: AlertScope;
  whatHappened: string;
  firstSeenUtc: string;
  lastSeenUtc: string;
  suggestedActionLabel: string;
  suggestedActionPath: string;
  correlationId?: string;
  activeCount: number;
  seenCount: number;
  activeAlertIds: string[];
}

function toSeverityView(severity: AlertRecord['severity']): { label: AlertSeverityLabel; tone: AlertTone } {
  if (severity === 'critical') {
    return { label: 'Critical', tone: 'critical' };
  }
  if (severity === 'warning') {
    return { label: 'Warning', tone: 'warn' };
  }
  return { label: 'Info', tone: 'info' };
}

function severityRank(tone: AlertTone): number {
  if (tone === 'critical') return 3;
  if (tone === 'warn') return 2;
  return 1;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function ensureSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function inferCategory(alert: AlertRecord): AlertCategory {
  const explicitType = alert.alert_type.toLowerCase();
  const hint = `${alert.alert_type} ${alert.target_service} ${alert.reason}`.toLowerCase();

  if (explicitType === 'agent_offline') return 'agent_offline';
  if (explicitType === 'backend_disconnected') return 'backend_disconnected';
  if (explicitType === 'signature_invalid' || explicitType === 'signature_verification_failure') return 'signature_invalid';
  if (explicitType === 'config_drift' || explicitType === 'policy_version_mismatch') return 'config_drift';
  if (explicitType === 'slo_breach' || explicitType === 'latency_breach') return 'slo_breach';
  if (explicitType === 'cohort_regression_spike') return 'cohort_regression_spike';
  if (explicitType === 'policy_thrash' || explicitType === 'intervention_failure') return 'policy_thrash';
  if (explicitType === 'circuit_breaker_open') return 'circuit_breaker_open';
  if (explicitType === 'ws_drop_spikes') return 'ws_drop_spikes';

  if (hint.includes('offline') || hint.includes('heartbeat') || hint.includes('agent down')) return 'agent_offline';
  if (hint.includes('backend disconnected') || hint.includes('control plane') || hint.includes('upstream unavailable')) {
    return 'backend_disconnected';
  }
  if (hint.includes('signature') || hint.includes('trust invalid')) return 'signature_invalid';
  if (hint.includes('drift') || hint.includes('version mismatch') || hint.includes('config mismatch')) return 'config_drift';
  if (hint.includes('slo') || hint.includes('latency') || hint.includes('p99')) return 'slo_breach';
  if (hint.includes('cohort') || hint.includes('regression') || hint.includes('degraded experimental')) {
    return 'cohort_regression_spike';
  }
  if (hint.includes('thrash') || hint.includes('flap') || hint.includes('too many intervention')) return 'policy_thrash';
  if (hint.includes('circuit breaker') || hint.includes('breaker open')) return 'circuit_breaker_open';
  if (hint.includes('websocket') || hint.includes('ws drop') || hint.includes('stream disconnected')) return 'ws_drop_spikes';

  if (explicitType === 'overload_probability' || explicitType === 'high_stress_probability') {
    return 'cohort_regression_spike';
  }

  return 'policy_thrash';
}

function inferScope(category: AlertCategory, alert: AlertRecord): AlertScope {
  if (category === 'agent_offline' || category === 'signature_invalid') return 'Machine';
  if (category === 'cohort_regression_spike') return 'Cohort';

  const hint = `${alert.target_service} ${alert.reason}`.toLowerCase();
  if (hint.includes('cohort') || hint.includes('canary') || hint.includes('stable')) return 'Cohort';
  if (hint.includes('machine') || hint.includes('node') || hint.includes('agent')) return 'Machine';
  return 'Fleet';
}

function categoryLabel(category: AlertCategory): string {
  switch (category) {
    case 'agent_offline':
      return 'Agent Offline';
    case 'backend_disconnected':
      return 'Backend Disconnected';
    case 'signature_invalid':
      return 'Signature Invalid';
    case 'config_drift':
      return 'Config Drift';
    case 'slo_breach':
      return 'SLO Breach';
    case 'cohort_regression_spike':
      return 'Cohort Regression Spike';
    case 'policy_thrash':
      return 'Policy Thrash';
    case 'circuit_breaker_open':
      return 'Circuit Breaker Open';
    case 'ws_drop_spikes':
      return 'WS Drop Spikes';
    default:
      return 'Alert';
  }
}

function defaultWhatHappened(category: AlertCategory): string {
  switch (category) {
    case 'agent_offline':
      return 'One or more agents stopped reporting heartbeat and are currently offline.';
    case 'backend_disconnected':
      return 'Agents cannot reach backend/control-plane dependencies.';
    case 'signature_invalid':
      return 'Config trust validation failed because one or more signatures were invalid.';
    case 'config_drift':
      return 'Applied machine configuration diverged from the expected config version.';
    case 'slo_breach':
      return 'Service performance exceeded configured SLO thresholds.';
    case 'cohort_regression_spike':
      return 'A monitored cohort regressed versus its baseline.';
    case 'policy_thrash':
      return 'Interventions are firing too often, indicating policy thrash/flapping.';
    case 'circuit_breaker_open':
      return 'A circuit breaker opened to prevent further instability.';
    case 'ws_drop_spikes':
      return 'Realtime websocket stream experienced repeated disconnect spikes.';
    default:
      return 'An alert condition was triggered.';
  }
}

function suggestedActionForCategory(
  category: AlertCategory,
  severity: AlertRecord['severity']
): { label: string; path: string } {
  switch (category) {
    case 'agent_offline':
      return { label: 'Open machines filtered', path: '/machines?offline=1' };
    case 'backend_disconnected':
      return { label: 'Open system health', path: '/system-health' };
    case 'signature_invalid':
      return { label: 'Open machines filtered', path: '/machines?signature=invalid' };
    case 'config_drift':
      return { label: 'Open config integrity', path: '/config' };
    case 'slo_breach':
      if (severity === 'critical') {
        return { label: 'Halt rollout', path: '/rollouts' };
      }
      return { label: 'Open cohorts', path: '/cohorts' };
    case 'cohort_regression_spike':
      return { label: 'Open cohort compare', path: '/cohorts?cohort=experimental&cohortCompare=1&cohortB=stable' };
    case 'policy_thrash':
      return { label: 'Open traces', path: '/audit-traces' };
    case 'circuit_breaker_open':
      return { label: 'Open rollouts', path: '/rollouts' };
    case 'ws_drop_spikes':
      return { label: 'Open system health', path: '/system-health' };
    default:
      return { label: 'Open traces', path: '/audit-traces' };
  }
}

export function AlertsPage() {
  const navigate = useNavigate();
  const { alerts, loading, error, resolveAlertsByIds } = useConsoleOperations({ includeAlertHistory: true });
  const [ackInFlightKeys, setAckInFlightKeys] = useState<string[]>([]);

  const groupedCards = useMemo<AlertGroupCard[]>(() => {
    const groups = new Map<string, AlertGroupCard>();

    for (const alert of alerts) {
      const severityView = toSeverityView(alert.severity);
      const category = inferCategory(alert);
      const scope = inferScope(category, alert);
      const action = suggestedActionForCategory(category, alert.severity);
      const whatHappened = ensureSentence(alert.reason) || defaultWhatHappened(category);
      const correlationId = alert.correlation_id?.trim() || undefined;
      const serviceHint = normalize(alert.target_service || 'fleet');
      const key = `${category}|${scope}|${serviceHint}`;

      const current = groups.get(key);
      if (!current) {
        const groupCard: AlertGroupCard = {
          key,
          category,
          severity: severityView.label,
          tone: severityView.tone,
          scope,
          whatHappened,
          firstSeenUtc: alert.first_seen_at,
          lastSeenUtc: alert.last_seen_at,
          suggestedActionLabel: action.label,
          suggestedActionPath: action.path,
          activeCount: alert.status === 'active' ? 1 : 0,
          seenCount: alert.status === 'resolved' ? 1 : 0,
          activeAlertIds: alert.status === 'active' ? [alert.alert_id] : []
        };
        if (correlationId) {
          groupCard.correlationId = correlationId;
        }
        groups.set(key, groupCard);
        continue;
      }

      if (severityRank(severityView.tone) > severityRank(current.tone)) {
        current.severity = severityView.label;
        current.tone = severityView.tone;
      }

      if (Date.parse(alert.first_seen_at) < Date.parse(current.firstSeenUtc)) {
        current.firstSeenUtc = alert.first_seen_at;
      }

      if (Date.parse(alert.last_seen_at) >= Date.parse(current.lastSeenUtc)) {
        current.lastSeenUtc = alert.last_seen_at;
        current.whatHappened = whatHappened;
        if (correlationId) {
          current.correlationId = correlationId;
        }
      }

      if (alert.status === 'active') {
        current.activeCount += 1;
        current.activeAlertIds.push(alert.alert_id);
      } else {
        current.seenCount += 1;
      }
    }

    return [...groups.values()].sort((left, right) => {
      const severityDelta = severityRank(right.tone) - severityRank(left.tone);
      if (severityDelta !== 0) {
        return severityDelta;
      }
      return Date.parse(right.lastSeenUtc) - Date.parse(left.lastSeenUtc);
    });
  }, [alerts]);

  const acknowledgeGroup = async (group: AlertGroupCard): Promise<void> => {
    if (group.activeAlertIds.length === 0) {
      return;
    }

    setAckInFlightKeys((current) => [...current, group.key]);
    try {
      await resolveAlertsByIds(group.activeAlertIds);
    } finally {
      setAckInFlightKeys((current) => current.filter((key) => key !== group.key));
    }
  };

  return (
    <div className="stack">
      <Panel title="Real-time alerts triage">
        {loading ? <p className="muted-line">Loading alerts...</p> : null}
        {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
        {groupedCards.length === 0 ? (
          <p className="muted-line">No active or acknowledged alerts.</p>
        ) : (
          <div className="alerts-triage-grid">
            {groupedCards.map((card) => {
              const acknowledgeBusy = ackInFlightKeys.includes(card.key);
              const acknowledgeDisabled = card.activeAlertIds.length === 0 || acknowledgeBusy;

              return (
                <article key={card.key} className={`alert-card ${card.tone}`}>
                  <header className="alert-card-header">
                    <span className={`alert-severity-pill ${card.tone}`}>{card.severity}</span>
                    <span className="alert-scope-pill">{card.scope}</span>
                    <span className="alert-type-label">{categoryLabel(card.category)}</span>
                  </header>

                  <p className="alert-what-happened">{card.whatHappened}</p>

                  <div className="alert-count-row">
                    <span className="status-health-pill">Active: {card.activeCount}</span>
                    <span className="status-health-pill">Seen: {card.seenCount}</span>
                  </div>

                  <dl className="alert-meta-grid">
                    <div>
                      <dt>First seen</dt>
                      <dd>{formatUtc(card.firstSeenUtc)}</dd>
                    </div>
                    <div>
                      <dt>Last seen</dt>
                      <dd>{formatUtc(card.lastSeenUtc)}</dd>
                    </div>
                    {card.correlationId ? (
                      <div className="alert-meta-span">
                        <dt>Correlation ID</dt>
                        <dd>{card.correlationId}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="alert-card-actions">
                    <button type="button" onClick={() => navigate(card.suggestedActionPath)}>
                      {card.suggestedActionLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => void acknowledgeGroup(card)}
                      disabled={acknowledgeDisabled}
                    >
                      {acknowledgeBusy
                        ? 'Acknowledging...'
                        : card.activeCount > 0
                          ? `Acknowledge (${card.activeCount})`
                          : 'Acknowledged'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
