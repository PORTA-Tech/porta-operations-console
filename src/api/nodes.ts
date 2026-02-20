import { apiRequest } from './client';
import type { components } from './generated/controlPlane';

export type NodeSnapshotRow = components['schemas']['NodeSnapshotView'];

export async function getNodeSnapshot(): Promise<NodeSnapshotRow[]> {
  return apiRequest({ path: '/v1/nodes/snapshot', method: 'get' });
}
