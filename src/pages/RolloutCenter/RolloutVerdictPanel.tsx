import { useMemo, useState } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { type ApiError, toApiError } from '../../api/client';
import { getRolloutEvidencePack, type RolloutEvaluation } from '../../api/rollout';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

interface RolloutVerdictPanelProps {
  data: RolloutEvaluation | undefined;
  loading: boolean;
  error: ApiError | undefined;
}

function verdictLabel(verdict: RolloutEvaluation['decision']['promotion_verdict']): string {
  if (verdict === 'ALLOW') return 'Yes';
  if (verdict === 'BLOCK') return 'No';
  return 'Inconclusive';
}

function verdictTone(verdict: RolloutEvaluation['decision']['promotion_verdict']): 'ok' | 'warn' | 'critical' {
  if (verdict === 'ALLOW') return 'ok';
  if (verdict === 'BLOCK') return 'critical';
  return 'warn';
}

function guardrailTone(status: RolloutEvaluation['guardrail_eval'][number]['status']): 'ok' | 'warn' | 'critical' | 'neutral' {
  if (status === 'PASS') return 'ok';
  if (status === 'FAIL') return 'critical';
  if (status === 'INCONCLUSIVE') return 'warn';
  return 'neutral';
}

function formatDetails(details: Record<string, string | number | boolean | null>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key}=${value === null ? 'null' : String(value)}`)
    .join(', ');
}

function downloadJson(name: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export function RolloutVerdictPanel({ data, loading, error }: RolloutVerdictPanelProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<ApiError | undefined>();

  const selectedEvent = useMemo(
    () => data?.events.find((event) => event.event_id === selectedEventId) ?? data?.events[0],
    [data?.events, selectedEventId]
  );

  const exportEvidence = async (): Promise<void> => {
    if (!data?.evidence.available) return;
    setExporting(true);
    setExportError(undefined);
    try {
      const pack = await getRolloutEvidencePack(300);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadJson(`rollout-evidence-pack-${stamp}.json`, pack);
    } catch (err) {
      setExportError(toApiError(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Panel title="Promotion Verdict">
      {loading ? <p className="muted-line">Evaluating rollout guardrails...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {data ? (
        <div className="stack">
          <section className={`rollout-verdict-card ${verdictTone(data.decision.promotion_verdict)}`}>
            <p className="rollout-verdict-label">Promote now</p>
            <p className="rollout-verdict-value">{verdictLabel(data.decision.promotion_verdict)}</p>
            <p className="rollout-verdict-reason">
              Triggered by: <strong>{data.decision.trigger_reason_code}</strong>
            </p>
            <p className="muted-line">{formatDetails(data.decision.trigger_reason_details)}</p>
            <p className="muted-line">Evaluated: {formatUtc(data.evaluated_at_utc)} ({formatRelativeFromNow(data.evaluated_at_utc)})</p>
          </section>

          <div className="machines-data-banner">
            <span>Freshness: <strong>{data.data_quality.freshness_seconds === null ? 'n/a' : `${data.data_quality.freshness_seconds}s`}</strong></span>
            <span>Coverage: <strong>{Math.min(
              data.data_quality.coverage_pct_by_cohort[data.data_quality.baseline_cohort_id] ?? 0,
              data.data_quality.coverage_pct_by_cohort[data.data_quality.target_cohort_id] ?? 0
            ).toFixed(1)}%</strong></span>
            <span>Stream: <strong>{data.data_quality.ws_stream_ok ? 'Live' : 'Disconnected'}</strong></span>
            <span>Trust: <strong>{data.data_quality.trust_status}</strong></span>
          </div>

          <table className="simple-table">
            <thead>
              <tr>
                <th>Data quality gate</th>
                <th>Baseline</th>
                <th>Target</th>
                <th>Threshold</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Sample size</td>
                <td>{data.data_quality.sample_size_by_cohort[data.data_quality.baseline_cohort_id] ?? 0}</td>
                <td>{data.data_quality.sample_size_by_cohort[data.data_quality.target_cohort_id] ?? 0}</td>
                <td>{data.data_quality.min_sample_machines}</td>
                <td>{data.data_quality.sample_valid ? 'OK' : 'Too low'}</td>
              </tr>
              <tr>
                <td>Coverage</td>
                <td>{(data.data_quality.coverage_pct_by_cohort[data.data_quality.baseline_cohort_id] ?? 0).toFixed(1)}%</td>
                <td>{(data.data_quality.coverage_pct_by_cohort[data.data_quality.target_cohort_id] ?? 0).toFixed(1)}%</td>
                <td>{data.data_quality.min_coverage_pct.toFixed(1)}%</td>
                <td>{data.data_quality.coverage_valid ? 'OK' : 'Too low'}</td>
              </tr>
              <tr>
                <td>Freshness</td>
                <td colSpan={2}>{data.data_quality.freshness_seconds === null ? 'n/a' : `${data.data_quality.freshness_seconds}s`}</td>
                <td>{'<= stale limit'}</td>
                <td>{data.data_quality.freshness_ok ? 'OK' : 'Stale'}</td>
              </tr>
            </tbody>
          </table>

          {!data.data_quality.valid ? (
            <p className="focus-banner">Not enough data to evaluate: {data.data_quality.messages.join(' ')}</p>
          ) : null}

          <h4>Guardrails</h4>
          <table className="simple-table">
            <thead>
              <tr>
                <th>Guardrail</th>
                <th>Status</th>
                <th>Value</th>
                <th>Threshold</th>
                <th>Window</th>
                <th>Evidence</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.guardrail_eval.map((guardrail) => (
                <tr key={guardrail.guardrail_id}>
                  <td>{guardrail.guardrail_id}</td>
                  <td>
                    <span className={`delta-chip ${guardrailTone(guardrail.status)}`}>
                      {guardrail.status}
                    </span>
                  </td>
                  <td>{guardrail.value_label || 'n/a'}</td>
                  <td>{guardrail.threshold_label || 'n/a'}</td>
                  <td>{guardrail.window}</td>
                  <td>{guardrail.evidence.correlation_ids.length > 0 ? guardrail.evidence.correlation_ids.join(', ') : 'none'}</td>
                  <td>{guardrail.reason_code ?? 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="rollout-fsm-wrap">
            <h4>Rollout FSM Timeline</h4>
            <ol className="rollout-stage-track">
              {data.rollout_stage_progression_preview.map((stage) => (
                <li key={stage} className={stage === data.rollout_state ? 'active' : undefined}>
                  {stage}
                </li>
              ))}
            </ol>
            <div className="rollout-marker-row">
              {data.events.slice(0, 12).map((event) => (
                <button
                  key={event.event_id}
                  type="button"
                  className={selectedEvent?.event_id === event.event_id ? 'active' : undefined}
                  onClick={() => setSelectedEventId(event.event_id)}
                >
                  {event.type}
                </button>
              ))}
            </div>
            {selectedEvent ? (
              <div className="timeline-side">
                <h4>Click to explain</h4>
                <ul className="kv-list">
                  <li><span>Type</span><strong>{selectedEvent.type}</strong></li>
                  <li><span>At</span><strong>{formatUtc(selectedEvent.timestamp_utc)}</strong></li>
                  <li><span>Actor</span><strong>{selectedEvent.actor}</strong></li>
                  <li><span>Config version</span><strong>{selectedEvent.config_version}</strong></li>
                  <li><span>Cohorts</span><strong>{selectedEvent.cohorts.join(', ') || 'n/a'}</strong></li>
                  <li><span>Correlation IDs</span><strong>{selectedEvent.correlation_ids.join(', ') || 'none'}</strong></li>
                  <li><span>Details</span><strong>{selectedEvent.details}</strong></li>
                </ul>
              </div>
            ) : null}
          </section>

          <h4>Rollout Event Stream</h4>
          <table className="simple-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Actor</th>
                <th>Config</th>
                <th>Cohorts</th>
                <th>Correlation IDs</th>
              </tr>
            </thead>
            <tbody>
              {data.events.slice(0, 20).map((event) => (
                <tr key={event.event_id}>
                  <td>{formatUtc(event.timestamp_utc)}</td>
                  <td>{event.type}</td>
                  <td>{event.actor}</td>
                  <td>{event.config_version}</td>
                  <td>{event.cohorts.join(', ') || 'n/a'}</td>
                  <td>{event.correlation_ids.join(', ') || 'none'}</td>
                </tr>
              ))}
              {data.events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted-line">No rollout events yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <section>
            <h4>Evidence Pack</h4>
            <p className="muted-line">
              Correlation IDs: {data.evidence.correlation_ids.length > 0 ? data.evidence.correlation_ids.join(', ') : 'none'}
            </p>
            <div className="button-row">
              <button
                type="button"
                onClick={() => void exportEvidence()}
                disabled={!data.evidence.available || exporting}
                title={!data.evidence.available ? 'No traces generated yet' : 'Export rollout evidence pack'}
              >
                {exporting ? 'Exporting...' : 'Export rollout evidence pack'}
              </button>
            </div>
            {exportError ? <p className="error-line">{exportError.code}: {exportError.message}</p> : null}
          </section>
        </div>
      ) : null}
    </Panel>
  );
}
