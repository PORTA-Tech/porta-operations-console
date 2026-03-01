import { Panel } from '../../components/Layout/Panel';
import { useAdapterPromotionPath } from '../../hooks/useAdapterPromotionPath';
import { useOperatorAuth } from '../../hooks/useOperatorAuth';

function reasonToSentence(code: string): string {
  if (code === 'feature_gate_disabled') return 'Feature gate is disabled by policy.';
  if (code === 'adapter_not_enabled') return 'Adapter is not enabled yet.';
  if (code === 'cooldown_active') return 'Cooldown is active.';
  if (code === 'rollout_state_blocked') return 'Rollout state does not allow advancement.';
  if (code === 'slo_guard_failed') return 'One or more SLO guardrails failed.';
  if (code === 'fsm_blocked') return 'FSM guardrail is blocking advancement.';
  return code;
}

export function AdapterPromotionPathPanel() {
  const { data, loading, error, advancing, advanceError, advance } = useAdapterPromotionPath();
  const { operatorRole } = useOperatorAuth();
  const canMutate = operatorRole === 'operator';
  const why = data?.guard_reasons.length
    ? data.guard_reasons.map((reason) => reasonToSentence(reason)).join(' ')
    : 'All path guardrails are currently healthy.';

  return (
    <Panel title="Promotion Path">
      {loading ? <p className="muted-line">Loading promotion path...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {data ? (
        <>
          <p>Current stage: <strong>{data.stage}</strong></p>
          <p>Next stage: <strong>{data.next_stage ?? 'n/a'}</strong></p>
          <p>Path status: <strong>{data.allowed_to_advance ? 'Ready to advance' : 'Blocked'}</strong></p>
          <p className="muted-line">Why: {why}</p>
          <details className="rollout-detail-box">
            <summary>Show details</summary>
            <div className="rollout-detail-content">
              <p className="muted-line">Rollout state: {data.rollout_state}</p>
              <p className="muted-line">Cooldown: {data.cooldown_active ? 'Active' : 'Inactive'}</p>
              {data.guard_reasons.length > 0 ? (
                <p className="muted-line">Reason codes: {data.guard_reasons.join(', ')}</p>
              ) : null}
            </div>
          </details>

          {canMutate ? (
            <div className="button-row">
              <button type="button" onClick={() => void advance()} disabled={advancing || !data.allowed_to_advance}>
                {advancing ? 'Advancing...' : 'Advance Path'}
              </button>
            </div>
          ) : (
            <p className="muted-line">Mutation actions hidden: operator role required.</p>
          )}
          {advanceError ? <p className="error-line">{advanceError.code}: {advanceError.message}</p> : null}
        </>
      ) : null}
    </Panel>
  );
}
