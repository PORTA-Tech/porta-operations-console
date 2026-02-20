import { Panel } from '../../components/Layout/Panel';

export function DryRunSimulation() {
  return (
    <Panel title="Dry-Run SLO Simulation">
      <p>This panel will consume future 8A simulation APIs. Current mode shows deterministic placeholders.</p>
      <p>If canary error rate exceeds 0.5%, promotion should halt automatically.</p>
    </Panel>
  );
}

