import type { SLOMetrics } from '../types/contracts';
import { apiRequest } from '../utils/apiHelpers';

export interface SloGateDecision {
  breached: boolean;
  tripped: boolean;
  triggerAction: boolean;
  recovered: boolean;
  rolloutState: string;
}

export async function evaluateSlo(metrics: SLOMetrics): Promise<SloGateDecision> {
  return apiRequest('/v1/slo/evaluate', {
    method: 'POST',
    body: JSON.stringify(metrics)
  });
}
