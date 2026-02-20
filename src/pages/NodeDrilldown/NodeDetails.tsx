import { useNodeDrilldown } from '../../hooks/useNodeDrilldown';
import { Panel } from '../../components/Layout/Panel';

export function NodeDetails() {
  const { nodes } = useNodeDrilldown();
  const node = nodes[0];

  return (
    <Panel title="Node Detail">
      <p>Node: <strong>{node.nodeId}</strong></p>
      <p>Signature: <strong>{node.signatureStatus}</strong></p>
      <p>Degradation: <strong>{node.degradationState}</strong></p>
      <p>Last heartbeat: <strong>{new Date(node.lastHeartbeatUtc).toLocaleString()}</strong></p>
    </Panel>
  );
}

