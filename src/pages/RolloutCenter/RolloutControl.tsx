import { useState } from 'react';
import { Panel } from '../../components/Layout/Panel';
import { useRollout } from '../../hooks/useRollout';

export function RolloutControl() {
  const { promote, halt, rollback } = useRollout();
  const [status, setStatus] = useState('Idle');

  const run = async (label: string, action: () => Promise<void>): Promise<void> => {
    setStatus(`${label}...`);
    try {
      await action();
      setStatus(`${label} completed`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Action failed');
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
    </Panel>
  );
}

