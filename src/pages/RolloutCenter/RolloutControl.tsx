import { useMemo, useState } from 'react';
import type { RolloutStatusView } from '../../types/apiContracts';
import { Panel } from '../../components/Layout/Panel';
import { useFleetSlice } from '../../store/fleetSlice';
import { formatUtc } from '../../utils/date';
import { StatusBadge } from '../../components/StatusIndicators/StatusBadge';
import { useRollout } from '../../hooks/useRollout';
import { toApiError, type ApiError } from '../../api/client';
import { useOperatorAuth } from '../../hooks/useOperatorAuth';
import { useSearchParams } from 'react-router-dom';
import type { RolloutEvaluation } from '../../api/rollout';

type RolloutActionId = 'initiate-promotion' | 'pause-rollout' | 'resume-rollout' | 'force-rollback';

type RolloutAction = {
  id: RolloutActionId;
  label: string;
  expectedTransition: (state?: RolloutStatusView['state']) => string;
  execute: () => Promise<{
    rollout_state: RolloutStatusView['state'];
    config_seq: RolloutStatusView['activeConfigSeq'];
    cooldown_until_utc: string | undefined;
    updated_at_utc: string;
  }>;
  danger?: boolean;
};

interface RolloutControlProps {
  evaluation: RolloutEvaluation | undefined;
}

function readActionBlockReason(
  evaluation: RolloutEvaluation | undefined,
  action: 'promote' | 'halt' | 'rollback'
): string | undefined {
  const scoped = evaluation?.permissions?.by_action?.[action];
  if (scoped && !scoped.allowed) {
    return scoped.blocked_reason_code ?? evaluation?.permissions?.blocked_reason_code;
  }
  if (evaluation?.permissions && !evaluation.permissions.can_promote && action === 'promote') {
    return evaluation.permissions.blocked_reason_code;
  }
  if (evaluation?.permissions && !evaluation.permissions.can_halt && action === 'halt') {
    return evaluation.permissions.blocked_reason_code;
  }
  return undefined;
}

function formatReasonDetails(details: Record<string, string | number | boolean | null> | undefined): string {
  if (!details) return '';
  return Object.entries(details).map(([key, value]) => `${key}=${String(value)}`).join(', ');
}

export function RolloutControl({ evaluation }: RolloutControlProps) {
  const [params] = useSearchParams();
  const rollout = useFleetSlice((s) => s.rollout);
  const haltIndicator = useFleetSlice((s) => s.haltIndicator);
  const setRollout = useFleetSlice((s) => s.setRollout);
  const {
    initiatePromotion: runInitiatePromotion,
    pauseRollout: runPauseRollout,
    resumeRollout: runResumeRollout,
    forceRollback: runForceRollback
  } = useRollout();
  const { operatorRole } = useOperatorAuth();
  const canMutateByRole = operatorRole === 'operator';
  const canPromote = evaluation?.permissions?.can_promote ?? canMutateByRole;
  const canHalt = evaluation?.permissions?.can_halt ?? canMutateByRole;
  const canRollback = evaluation?.permissions?.by_action?.rollback?.allowed ?? canMutateByRole;
  const [selectedAction, setSelectedAction] = useState<RolloutAction | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<ApiError | undefined>();
  const filterCooldownActive = params.get('cooldown') === 'active';
  const cooldownIsActive = Boolean(
    rollout?.state === 'COOLDOWN'
    || (rollout?.cooldownUntilUtc && Date.parse(rollout.cooldownUntilUtc) > Date.now())
  );

  const actions = useMemo<RolloutAction[]>(
    () => [
      {
        id: 'initiate-promotion',
        label: 'Initiate promotion',
        expectedTransition: (state) => `${state ?? 'UNKNOWN'} -> PROMOTING`,
        execute: runInitiatePromotion
      },
      {
        id: 'pause-rollout',
        label: 'Pause rollout',
        expectedTransition: (state) => `${state ?? 'UNKNOWN'} -> HALTED`,
        execute: runPauseRollout
      },
      {
        id: 'resume-rollout',
        label: 'Resume rollout',
        expectedTransition: (state) => `${state ?? 'UNKNOWN'} -> PROMOTING`,
        execute: runResumeRollout
      },
      {
        id: 'force-rollback',
        label: 'Force rollback',
        expectedTransition: (state) => `${state ?? 'UNKNOWN'} -> ROLLED_BACK / COOLDOWN`,
        execute: runForceRollback,
        danger: true
      }
    ],
    [runInitiatePromotion, runPauseRollout, runResumeRollout, runForceRollback]
  );

  const blockedReason = evaluation?.permissions?.blocked_reason_code;

  const executeAction = async (): Promise<void> => {
    if (!selectedAction || !rollout) return;

    setSubmitting(true);
    setActionError(undefined);

    try {
      const result = await selectedAction.execute();
      setRollout({
        state: result.rollout_state,
        activeConfigSeq: result.config_seq,
        updatedAtUtc: result.updated_at_utc,
        ...(result.cooldown_until_utc !== undefined ? { cooldownUntilUtc: result.cooldown_until_utc } : {}),
        ...(rollout.targetCohort !== undefined ? { targetCohort: rollout.targetCohort } : {})
      });
      setSelectedAction(undefined);
    } catch (error) {
      setActionError(toApiError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel title="Promotion Controls">
      {filterCooldownActive ? (
        <p className={`focus-banner ${cooldownIsActive ? '' : 'focus-banner-neutral'}`}>
          Filter applied: cooldown-active rollouts {cooldownIsActive ? 'are currently blocking promotion.' : 'are not active right now.'}
        </p>
      ) : null}
      <p>Rollout status: <strong>{rollout?.state ?? 'Unknown'}</strong></p>
      <p>Config version: <strong>{rollout?.activeConfigSeq ?? 'n/a'}</strong></p>
      <p>Rollout cooldown until: <strong>{rollout?.cooldownUntilUtc ? formatUtc(rollout.cooldownUntilUtc) : 'n/a'}</strong></p>
      <p>
        Safety halt:{' '}
        <StatusBadge label={haltIndicator ? 'Active' : 'Clear'} tone={haltIndicator ? 'critical' : 'ok'} />
      </p>
      <p className="muted-line">Cooldown clearing is backend-only.</p>
      {canMutateByRole ? (
        <div className="button-row">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={action.danger ? 'danger' : undefined}
              onClick={() => {
                setActionError(undefined);
                setSelectedAction(action);
              }}
              disabled={
                !rollout
                || submitting
                || (
                  (action.id === 'initiate-promotion' || action.id === 'resume-rollout')
                    ? !canPromote
                    : action.id === 'pause-rollout'
                      ? !canHalt
                      : action.id === 'force-rollback'
                        ? !canRollback
                        : false
                )
              }
              title={
                action.id === 'initiate-promotion' || action.id === 'resume-rollout'
                  ? readActionBlockReason(evaluation, 'promote')
                  : action.id === 'pause-rollout'
                    ? readActionBlockReason(evaluation, 'halt')
                    : action.id === 'force-rollback'
                      ? readActionBlockReason(evaluation, 'rollback')
                      : undefined
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted-line">Mutation actions hidden: operator role required.</p>
      )}
      {blockedReason ? <p className="muted-line">Backend policy gate: {blockedReason}</p> : null}
      {evaluation?.permissions?.blocked_reason_details ? (
        <p className="muted-line">{formatReasonDetails(evaluation.permissions.blocked_reason_details)}</p>
      ) : null}
      {selectedAction ? (
        <div className="confirm-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="rollout-confirm-title">
          <div className="confirm-modal">
            <h4 id="rollout-confirm-title">Confirm: {selectedAction.label}</h4>
            <p>Current rollout status: <strong>{rollout?.state ?? 'Unknown'}</strong></p>
            <p>Current config version: <strong>{rollout?.activeConfigSeq ?? 'n/a'}</strong></p>
            <p>Expected transition: <strong>{selectedAction.expectedTransition(rollout?.state)}</strong></p>
            {actionError ? <p className="error-line">{actionError.code}: {actionError.message}</p> : null}
            <div className="button-row">
              <button type="button" onClick={() => void executeAction()} disabled={submitting || !rollout}>
                {submitting ? 'Executing...' : 'Confirm action'}
              </button>
              <button type="button" onClick={() => setSelectedAction(undefined)} disabled={submitting}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

