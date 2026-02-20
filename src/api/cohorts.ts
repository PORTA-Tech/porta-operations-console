import type { CohortId, RolloutStatusView } from '@porta/api-contracts';
import { getFleetState } from './fleet';
import type { CohortTrendPoint, CohortWindow } from '../types/ui';

export type CohortSnapshot = {
  cohortId: CohortId;
  exposurePct: number;
  status: RolloutStatusView['state'];
};

export interface CohortSummary {
  cohortId: CohortId;
  nodeCount: number;
  errorRatePct: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  degradationRatePct: number;
  configSeqDistribution: Record<string, number>;
  trend: CohortTrendPoint[];
}

const cohorts: CohortId[] = ['stable', 'canary-1', 'canary-5', 'internal', 'experimental'];

// Backend cohort endpoints are pending; this mirrors 8A rollout state for now.
export async function getCohortSnapshots(): Promise<CohortSnapshot[]> {
  const state = await getFleetState();
  return [
    { cohortId: 'canary-1', exposurePct: 1, status: state.state },
    { cohortId: 'canary-5', exposurePct: 5, status: state.state },
    { cohortId: 'stable', exposurePct: 94, status: state.state }
  ];
}

function baseMetrics(cohortId: CohortId): Omit<CohortSummary, 'cohortId' | 'trend'> {
  const table: Record<CohortId, Omit<CohortSummary, 'cohortId' | 'trend'>> = {
    stable: {
      nodeCount: 940,
      errorRatePct: 0.08,
      latencyP50Ms: 45,
      latencyP95Ms: 94,
      latencyP99Ms: 132,
      degradationRatePct: 0.2,
      configSeqDistribution: { '30': 884, '29': 56 }
    },
    'canary-1': {
      nodeCount: 10,
      errorRatePct: 0.18,
      latencyP50Ms: 52,
      latencyP95Ms: 126,
      latencyP99Ms: 176,
      degradationRatePct: 0.5,
      configSeqDistribution: { '30': 10 }
    },
    'canary-5': {
      nodeCount: 50,
      errorRatePct: 0.26,
      latencyP50Ms: 57,
      latencyP95Ms: 146,
      latencyP99Ms: 202,
      degradationRatePct: 0.7,
      configSeqDistribution: { '30': 42, '29': 8 }
    },
    internal: {
      nodeCount: 25,
      errorRatePct: 0.05,
      latencyP50Ms: 41,
      latencyP95Ms: 85,
      latencyP99Ms: 118,
      degradationRatePct: 0.1,
      configSeqDistribution: { '30': 25 }
    },
    experimental: {
      nodeCount: 15,
      errorRatePct: 0.49,
      latencyP50Ms: 76,
      latencyP95Ms: 188,
      latencyP99Ms: 238,
      degradationRatePct: 1.2,
      configSeqDistribution: { '30': 9, '29': 6 }
    }
  };

  return table[cohortId];
}

function windowConfig(window: CohortWindow): { points: number; stepMs: number; smoothing: number } {
  if (window === '15m') return { points: 6, stepMs: 2.5 * 60_000, smoothing: 1.06 };
  if (window === '1h') return { points: 12, stepMs: 5 * 60_000, smoothing: 1 };
  if (window === '6h') return { points: 12, stepMs: 30 * 60_000, smoothing: 0.92 };
  return { points: 24, stepMs: 60 * 60_000, smoothing: 0.86 };
}

function buildTrend(cohortId: CohortId, window: CohortWindow, base: Omit<CohortSummary, 'cohortId' | 'trend'>): CohortTrendPoint[] {
  const { points, stepMs, smoothing } = windowConfig(window);
  const now = Date.now();
  const phaseSeed = cohorts.indexOf(cohortId) + 1;

  return Array.from({ length: points }, (_, index) => {
    const wave = Math.sin((index + phaseSeed) / 2.2) * 0.18 + Math.cos((index + phaseSeed) / 4.3) * 0.09;
    const trendFactor = 1 + wave * 0.5;
    const at = now - (points - index - 1) * stepMs;

    return {
      timestampUtc: new Date(at).toISOString(),
      errorRatePct: Number((base.errorRatePct * smoothing * trendFactor).toFixed(3)),
      p99LatencyMs: Math.max(1, Math.round(base.latencyP99Ms * smoothing * (0.95 + wave * 0.12))),
      degradationRatePct: Number((base.degradationRatePct * smoothing * (0.92 + wave * 0.2)).toFixed(3))
    };
  });
}

export async function getCohortSummary(window: CohortWindow): Promise<CohortSummary[]> {
  return cohorts.map((cohortId) => {
    const base = baseMetrics(cohortId);
    return {
      cohortId,
      ...base,
      trend: buildTrend(cohortId, window, base)
    };
  });
}
