import { apiRequest } from './client';
import type { components } from './generated/controlPlane';

export type AdapterActivationControlsView = components['schemas']['AdapterActivationControlsView'];
export type AdapterActivationControlsUpdate = components['schemas']['AdapterActivationControlsUpdate'];
export type AdapterCohortObservabilityRow = components['schemas']['AdapterCohortObservabilityRow'];
export type AdapterReplayLogRow = components['schemas']['AdapterReplayLogRow'];
export type AdapterPromotionPathView = components['schemas']['AdapterPromotionPathView'];

export async function getAdapterControls(): Promise<AdapterActivationControlsView> {
  return apiRequest({ path: '/v1/adapter/controls', method: 'get' });
}

export async function updateAdapterControls(
  body: AdapterActivationControlsUpdate
): Promise<AdapterActivationControlsView> {
  return apiRequest({ path: '/v1/adapter/controls', method: 'post', body });
}

export async function getAdapterObservability(): Promise<AdapterCohortObservabilityRow[]> {
  return apiRequest({ path: '/v1/adapter/observability', method: 'get' });
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
