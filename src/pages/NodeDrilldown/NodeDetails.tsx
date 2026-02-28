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
      <Panel title="Machine detail">
        <p className="muted-line">Loading machine detail...</p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="Machine detail">
        <p className="error-line">{error.code}: {error.message}</p>
      </Panel>
    );
  }

  if (!node) {
    return (
      <Panel title="Machine detail">
        <p className="muted-line">No machine snapshot is available.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Machine detail">
      <p>Machine: <strong>{node.nodeId}</strong></p>
      <p>Trust check: <strong>{node.signatureStatus}</strong></p>
      <p>Performance state: <strong>{node.degradationState}</strong></p>
      <p>Last heartbeat: <strong>{new Date(node.lastHeartbeatUtc).toLocaleString()}</strong></p>
    </Panel>
  );
}

