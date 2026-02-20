import { useState } from 'react';
import { toApiError, type ApiError } from '../../api/client';
import type { RolloutMutationResult } from '../../api/rollout';
import { Panel } from '../../components/Layout/Panel';
import { useRollout } from '../../hooks/useRollout';

export function RolloutControl() {
  const { promote, halt, rollback } = useRollout();
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<ApiError | undefined>();
  const [result, setResult] = useState<RolloutMutationResult | undefined>();

  const run = async (label: string, action: () => Promise<RolloutMutationResult>): Promise<void> => {
    setStatus(`${label}...`);
    setError(undefined);
    try {
      const response = await action();
      setResult(response);
      setStatus(`${label} completed`);
    } catch (error) {
      const apiError = toApiError(error);
      setError(apiError);
      setStatus(`${label} failed`);
    }
  };

  return (
    <Panel title="Rollout Control Center">
      <div className="button-row">
        <button onClick={() => void run('Promote', promote)}>Promote</button>
        <button onClick={() => void run('Halt', halt)}>Halt</button>
        <button className="danger" onClick={() => void run('Rollback', rollback)}>Rollback</button>
      </div>
      <p>{status}</p>
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {result ? (
        <div>
          <p>rollout_state: <strong>{result.rollout_state}</strong></p>
          <p>config_seq: <strong>{result.config_seq}</strong></p>
          <p>cooldown_until_utc: <strong>{result.cooldown_until_utc ?? 'n/a'}</strong></p>
          <p>halt_status: <strong>{String(result.halt_status)}</strong></p>
        </div>
      ) : null}
    </Panel>
  );
}

