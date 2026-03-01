import { apiRequest, apiRequestRaw } from './client';
import type { components } from './generated/controlPlane';

export type AdapterActivationControlsView = components['schemas']['AdapterActivationControlsView'];
export type AdapterActivationControlsUpdate = components['schemas']['AdapterActivationControlsUpdate'];
export type AdapterReplayLogRow = components['schemas']['AdapterReplayLogRow'];
export type AdapterPromotionPathView = components['schemas']['AdapterPromotionPathView'];

export interface AdapterCohortObservabilityRow {
  cohort: string;
  adapter_error_rate_pct: number | null;
  adapter_latency_ms: number | null;
  circuit_breaker_state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'DISABLED' | 'UNKNOWN';
  metrics_available: boolean;
  sample_size: number;
  sample_min_required: number;
  availability_reason_code?: string;
  replay_log_count?: number;
  permissions?: {
    can_view_replay_logs: boolean;
    blocked_reason_code?: string;
    blocked_reason_details?: Record<string, string | number | boolean | null>;
  };
  sampled_at_utc: string;
}

export async function getAdapterControls(): Promise<AdapterActivationControlsView> {
  return apiRequest({ path: '/v1/adapter/controls', method: 'get' });
}

export async function updateAdapterControls(
  body: AdapterActivationControlsUpdate
): Promise<AdapterActivationControlsView> {
  return apiRequest({ path: '/v1/adapter/controls', method: 'post', body });
}

export async function getAdapterObservability(): Promise<AdapterCohortObservabilityRow[]> {
  return apiRequestRaw<AdapterCohortObservabilityRow[]>({ path: '/v1/adapter/observability', method: 'get' });
}

export async function getAdapterReplayLog(cohort: string): Promise<AdapterReplayLogRow[]> {
  const encoded = encodeURIComponent(cohort);
  return fetchReplayLogRaw(encoded);
}

async function fetchReplayLogRaw(encodedCohort: string): Promise<AdapterReplayLogRow[]> {
  const url = `/v1/adapter/replay-log?cohort=${encodedCohort}`;
  return apiRequest({ path: url as '/v1/adapter/replay-log', method: 'get' });
}

export async function getAdapterPromotionPath(): Promise<AdapterPromotionPathView> {
  return apiRequest({ path: '/v1/adapter/promotion-path', method: 'get' });
}

export async function advanceAdapterPromotionPath(): Promise<AdapterPromotionPathView> {
  return apiRequest({ path: '/v1/adapter/promotion-path', method: 'post' });
}
