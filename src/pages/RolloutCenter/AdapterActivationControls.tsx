import { useEffect, useState } from 'react';
import type { CohortId } from '../../types/apiContracts';
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
    <Panel title="Adapter Controls">
      {loading ? <p className="muted-line">Loading adapter controls...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {data ? (
        <>
          <p>Policy gate: <strong>{data.feature_gate_enabled ? 'Enabled' : 'Disabled'}</strong></p>
          <p>Rollout state: <strong>{data.rollout_state}</strong></p>

          <div className="adapter-form-grid">
            <label className="adapter-row">
              <span>Adapter enabled</span>
              <input
                type="checkbox"
                checked={draft.feature_adapter_enabled}
                onChange={(event) => setDraft((current) => ({ ...current, feature_adapter_enabled: event.target.checked }))}
                disabled={!data.feature_gate_enabled || !canMutate}
              />
            </label>

            <div className="adapter-row">
              <span>Allowed cohorts</span>
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
              <span>Rate limit</span>
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
              <span>Circuit breaker threshold</span>
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
              <span>Schema version</span>
              <input
                type="text"
                value={draft.schema_version}
                onChange={(event) => setDraft((current) => ({ ...current, schema_version: event.target.value }))}
                disabled={!data.feature_gate_enabled || !canMutate}
              />
            </label>
          </div>

          {!data.feature_gate_enabled ? (
            <p className="focus-banner">Adapter is disabled by policy. Metrics and promotions stay unavailable until the gate is enabled.</p>
          ) : null}
          {enablingBypassBlocked ? (
            <p className="error-line">Adapter can only be enabled while rollout is in the Promoting state.</p>
          ) : null}
          {!canMutate ? <p className="muted-line">Mutation actions hidden: operator role required.</p> : null}
          {saveError ? <p className="error-line">{saveError.code}: {saveError.message}</p> : null}

          <details className="rollout-detail-box">
            <summary>Show details</summary>
            <div className="rollout-detail-content">
              <p className="muted-line">feature_gate_enabled={String(data.feature_gate_enabled)}</p>
              <p className="muted-line">feature_adapter_enabled={String(draft.feature_adapter_enabled)}</p>
              <p className="muted-line">rollout_state={data.rollout_state}</p>
            </div>
          </details>

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
