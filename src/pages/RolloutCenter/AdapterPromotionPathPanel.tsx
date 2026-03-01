import { Panel } from '../../components/Layout/Panel';
import { useAdapterPromotionPath } from '../../hooks/useAdapterPromotionPath';
import { useOperatorAuth } from '../../hooks/useOperatorAuth';

export function AdapterPromotionPathPanel() {
  const { data, loading, error, advancing, advanceError, advance } = useAdapterPromotionPath();
  const { operatorRole } = useOperatorAuth();
  const canMutate = operatorRole === 'operator';

  return (
    <Panel title="Promotion Path">
      {loading ? <p className="muted-line">Loading promotion path...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {data ? (
        <>
          <p>stage: <strong>{data.stage}</strong></p>
          <p>next_stage: <strong>{data.next_stage ?? 'n/a'}</strong></p>
          <p>rollout_state: <strong>{data.rollout_state}</strong></p>
          <p>cooldown_active: <strong>{data.cooldown_active ? 'true' : 'false'}</strong></p>
          <p>SLO/FSM/Cooldown guards: <strong>{data.allowed_to_advance ? 'pass' : 'blocked'}</strong></p>
          {data.guard_reasons.length > 0 ? <p className="muted-line">{data.guard_reasons.join(', ')}</p> : null}

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
