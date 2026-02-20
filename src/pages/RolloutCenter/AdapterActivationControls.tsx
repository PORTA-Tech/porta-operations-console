import { useEffect, useState } from 'react';
import type { CohortId } from '@porta/api-contracts';
import { Panel } from '../../components/Layout/Panel';
import { useAdapterControls } from '../../hooks/useAdapterControls';
import { useOperatorAuth } from '../../hooks/useOperatorAuth';

const cohortOptions: CohortId[] = ['stable', 'canary-1', 'canary-5', 'internal', 'experimental'];

export function AdapterActivationControls() {
  const { data, loading, error, saving, saveError, save } = useAdapterControls();
  const { operatorRole } = useOperatorAuth();
  const canMutate = operatorRole === 'operator';
  const [draft, setDraft] = useState({
    feature_adapter_enabled: false,
    allowed_cohorts: ['canary-1'] as CohortId[],
    rate_limit: 100,
    circuit_breaker_threshold: 5,
    schema_version: '1.0.0'
  });

  useEffect(() => {
    if (!data) return;
    setDraft({
      feature_adapter_enabled: data.feature_adapter_enabled,
      allowed_cohorts: data.allowed_cohorts,
      rate_limit: data.rate_limit,
      circuit_breaker_threshold: data.circuit_breaker_threshold,
      schema_version: data.schema_version
    });
  }, [data]);

  const toggleCohort = (cohort: CohortId): void => {
    setDraft((current) => ({
      ...current,
      allowed_cohorts: current.allowed_cohorts.includes(cohort)
        ? current.allowed_cohorts.filter((value) => value !== cohort)
        : [...current.allowed_cohorts, cohort]
    }));
  };

  const enablingBypassBlocked =
    data &&
    !data.feature_adapter_enabled &&
    draft.feature_adapter_enabled &&
    data.rollout_state !== 'PROMOTING';

  return (
    <Panel title="Adapter Activation Controls (Flag-Gated)">
      {loading ? <p className="muted-line">Loading adapter controls...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {data ? (
        <>
          <p>feature gate enabled: <strong>{data.feature_gate_enabled ? 'true' : 'false'}</strong></p>
          <p>rollout_state: <strong>{data.rollout_state}</strong></p>

          <div className="adapter-form-grid">
            <label className="adapter-row">
              <span>feature.adapter.enabled</span>
              <input
                type="checkbox"
                checked={draft.feature_adapter_enabled}
                onChange={(event) => setDraft((current) => ({ ...current, feature_adapter_enabled: event.target.checked }))}
                disabled={!data.feature_gate_enabled || !canMutate}
              />
            </label>

            <div className="adapter-row">
              <span>allowed_cohorts[]</span>
              <div className="adapter-cohort-list">
                {cohortOptions.map((cohort) => (
                  <label key={cohort}>
                    <input
                      type="checkbox"
                      checked={draft.allowed_cohorts.includes(cohort)}
                      onChange={() => toggleCohort(cohort)}
                      disabled={!data.feature_gate_enabled || !canMutate}
                    />
                    {cohort}
                  </label>
                ))}
              </div>
            </div>

            <label className="adapter-row">
              <span>rate_limit</span>
              <input
                type="number"
                min={1}
                value={draft.rate_limit}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, rate_limit: Math.max(1, Number(event.target.value) || 1) }))
                }
                disabled={!data.feature_gate_enabled || !canMutate}
              />
            </label>

            <label className="adapter-row">
              <span>circuit_breaker_threshold</span>
              <input
                type="number"
                min={1}
                value={draft.circuit_breaker_threshold}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    circuit_breaker_threshold: Math.max(1, Number(event.target.value) || 1)
                  }))
                }
                disabled={!data.feature_gate_enabled || !canMutate}
              />
            </label>

            <label className="adapter-row">
              <span>schema_version</span>
              <input
                type="text"
                value={draft.schema_version}
                onChange={(event) => setDraft((current) => ({ ...current, schema_version: event.target.value }))}
                disabled={!data.feature_gate_enabled || !canMutate}
              />
            </label>
          </div>

          {!data.feature_gate_enabled ? (
            <p className="muted-line">Adapter expansion gate is disabled by backend policy.</p>
          ) : null}
          {enablingBypassBlocked ? (
            <p className="error-line">
              Activation bypass blocked: enabling adapter requires rollout_state PROMOTING (8A rollout FSM).
            </p>
          ) : null}
          {!canMutate ? <p className="muted-line">Mutation actions hidden: operator role required.</p> : null}
          {saveError ? <p className="error-line">{saveError.code}: {saveError.message}</p> : null}

          {canMutate ? (
            <div className="button-row">
              <button
                type="button"
                onClick={() => void save({ ...data, ...draft })}
                disabled={!data.feature_gate_enabled || draft.allowed_cohorts.length === 0 || enablingBypassBlocked || saving}
              >
                {saving ? 'Saving...' : 'Apply Controls'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
