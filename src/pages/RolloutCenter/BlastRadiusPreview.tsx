import { Panel } from '../../components/Layout/Panel';

export function BlastRadiusPreview() {
  return (
    <Panel title="Blast Radius Preview">
      <p>Projected impact is simulated from cohort weights and current node distribution.</p>
      <ul>
        <li>canary-1: ~1% nodes</li>
        <li>canary-5: ~5% nodes</li>
        <li>stable: ~94% nodes</li>
      </ul>
    </Panel>
  );
}

