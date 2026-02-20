import { useEffect, useMemo, useState } from 'react';
import { getNodeSnapshot } from '../api/nodes';
import { toApiError, type ApiError } from '../api/client';
import type { NodeDetail } from '../types/ui';

export function useNodeDrilldown(): { nodes: NodeDetail[]; loading: boolean; error: ApiError | undefined } {
  const [nodes, setNodes] = useState<NodeDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  useEffect(() => {
    let mounted = true;

    const refresh = async (): Promise<void> => {
      try {
        const snapshot = await getNodeSnapshot();
        if (!mounted) return;

        setNodes(
          snapshot.map((row) => ({
            nodeId: row.node_id,
            cohortId: row.cohort,
            configSeq: row.config_seq,
            signatureStatus: row.signature_valid ? 'verified' : 'invalid',
            lastHeartbeatUtc: row.last_heartbeat,
            degradationState: row.degradation_state,
            sloCompliant: row.SLO_compliance === 'compliant'
          }))
        );
        setError(undefined);
      } catch (err) {
        if (!mounted) return;
        setError(toApiError(err));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5_000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return useMemo(() => ({ nodes, loading, error }), [nodes, loading, error]);
}
