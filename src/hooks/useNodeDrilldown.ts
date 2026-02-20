import { useMemo } from 'react';
import type { NodeDetail } from '../types/ui';

export function useNodeDrilldown(): { nodes: NodeDetail[] } {
  return useMemo(
    () => ({
      nodes: [
        {
          nodeId: '0e1ef7e7-1f0f-4932-ad1c-b46d3fd1b7d4',
          cohortId: 'canary-1',
          configSeq: 30,
          signatureStatus: 'verified',
          lastHeartbeatUtc: new Date().toISOString(),
          degradationState: 'normal',
          sloCompliant: true
        },
        {
          nodeId: 'd2f8af76-eb8f-4d3a-a6bc-3677392818f7',
          cohortId: 'stable',
          configSeq: 29,
          signatureStatus: 'verified',
          lastHeartbeatUtc: new Date(Date.now() - 4000).toISOString(),
          degradationState: 'degraded',
          sloCompliant: false
        }
      ]
    }),
    []
  );
}
