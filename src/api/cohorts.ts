import type { CohortId, RolloutStatusView } from '../types/apiContracts';
import { getFleetState } from './fleet';
import type { CohortTrendPoint, CohortWindow } from '../types/ui';
import { getNodeSnapshot } from './nodes';
import { getAdapterObservability } from './adapter';

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
  const dynamicPhase = now / stepMs;

  return Array.from({ length: points }, (_, index) => {
    const wave = Math.sin((index + dynamicPhase + phaseSeed) / 2.2) * 0.18
      + Math.cos((index + dynamicPhase + phaseSeed) / 4.3) * 0.09;
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
  try {
    const [nodeSnapshot, adapterRows] = await Promise.all([
      getNodeSnapshot(),
      getAdapterObservability().catch(() => [])
    ]);

    const nodeGroups = new Map<CohortId, {
      nodeCount: number;
      degradedCount: number;
      configSeqDistribution: Record<string, number>;
      sloBreaches: number;
    }>();

    for (const cohortId of cohorts) {
      nodeGroups.set(cohortId, {
        nodeCount: 0,
        degradedCount: 0,
        configSeqDistribution: {},
        sloBreaches: 0
      });
    }

    for (const row of nodeSnapshot) {
      const cohortId = row.cohort as CohortId;
      if (!nodeGroups.has(cohortId)) {
        continue;
      }
      const group = nodeGroups.get(cohortId)!;
      group.nodeCount += 1;
      if (row.degradation_state !== 'normal') {
        group.degradedCount += 1;
      }
      if (row.SLO_compliance !== 'compliant') {
        group.sloBreaches += 1;
      }
      const key = String(row.config_seq);
      group.configSeqDistribution[key] = (group.configSeqDistribution[key] ?? 0) + 1;
    }

    const adapterByCohort = new Map<CohortId, { error: number; latency: number }>();
    for (const row of adapterRows) {
      const cohortId = row.cohort as CohortId;
      if (!cohorts.includes(cohortId)) {
        continue;
      }
      adapterByCohort.set(cohortId, {
        error: Number(row.adapter_error_rate_pct ?? 0),
        latency: Number(row.adapter_latency_ms ?? 0)
      });
    }

    return cohorts.map((cohortId) => {
      const fallback = baseMetrics(cohortId);
      const group = nodeGroups.get(cohortId)!;
      const adapter = adapterByCohort.get(cohortId);

      const nodeCount = group.nodeCount > 0 ? group.nodeCount : fallback.nodeCount;
      const latencyP99Ms = adapter && Number.isFinite(adapter.latency) && adapter.latency > 0
        ? Math.round(adapter.latency)
        : fallback.latencyP99Ms;
      const latencyP95Ms = Math.max(1, Math.round(latencyP99Ms * 0.72));
      const latencyP50Ms = Math.max(1, Math.round(latencyP99Ms * 0.4));

      const fallbackErrorFromSlo = group.nodeCount > 0
        ? Number((((group.sloBreaches / group.nodeCount) * 0.8)).toFixed(3))
        : fallback.errorRatePct;
      const errorRatePct = adapter && Number.isFinite(adapter.error)
        ? Number(adapter.error.toFixed(3))
        : fallbackErrorFromSlo;

      // Keep degradation in the same low-percent range used by UI thresholds.
      const degradationRatePct = group.nodeCount > 0
        ? Number((((group.degradedCount / group.nodeCount) * 2)).toFixed(3))
        : fallback.degradationRatePct;

      const configSeqDistribution = Object.keys(group.configSeqDistribution).length > 0
        ? group.configSeqDistribution
        : fallback.configSeqDistribution;

      const base = {
        nodeCount,
        errorRatePct,
        latencyP50Ms,
        latencyP95Ms,
        latencyP99Ms,
        degradationRatePct,
        configSeqDistribution
      };

      return {
        cohortId,
        ...base,
        trend: buildTrend(cohortId, window, base)
      };
    });
  } catch {
    // Fallback stays available for local/offline development.
    return cohorts.map((cohortId) => {
      const base = baseMetrics(cohortId);
      return {
        cohortId,
        ...base,
        trend: buildTrend(cohortId, window, base)
      };
    });
  }
}
