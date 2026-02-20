import { Panel } from '../../components/Layout/Panel';
import type { ApiError } from '../../api/client';
import type { NodeDetail } from '../../types/ui';

interface NodeDetailsProps {
  nodes: NodeDetail[];
  loading: boolean;
  error: ApiError | undefined;
}

export function NodeDetails({ nodes, loading, error }: NodeDetailsProps) {
  const node = nodes[0];

  if (loading) {
    return (
      <Panel title="Node Detail">
        <p className="muted-line">Loading node detail...</p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="Node Detail">
        <p className="error-line">{error.code}: {error.message}</p>
      </Panel>
    );
  }

  if (!node) {
    return (
      <Panel title="Node Detail">
        <p className="muted-line">No node snapshot available.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Node Detail">
      <p>Node: <strong>{node.nodeId}</strong></p>
      <p>Signature: <strong>{node.signatureStatus}</strong></p>
      <p>Degradation: <strong>{node.degradationState}</strong></p>
      <p>Last heartbeat: <strong>{new Date(node.lastHeartbeatUtc).toLocaleString()}</strong></p>
    </Panel>
  );
}

