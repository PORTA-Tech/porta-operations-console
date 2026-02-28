import type { CohortId, RolloutStatusView } from '../types/apiContracts';
import type { CohortTrendPoint, CohortWindow } from '../types/ui';
import { getFleetState } from './fleet';
import { apiRequestRaw } from './client';

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
  deltaErrorPct: number;
  deltaP99Ms: number;
  deltaDegradationPct: number;
  confidence: 'low' | 'medium' | 'high';
  trend: CohortTrendPoint[];
  activeEventCount: number;
}

export interface CohortRegressionEvent {
  eventId: string;
  correlationId: string;
  type: 'COHORT_REGRESSION';
  cohortId: CohortId;
  baselineCohortId: CohortId;
  metric: 'error_rate' | 'p99_latency' | 'degradation_rate';
  delta: number;
  threshold: number;
  severity: 'warning' | 'critical';
  confidence: 'low' | 'medium' | 'high';
  machineCount: number;
  window: CohortWindow;
  triggeredAtUtc: string;
  lastSeenAtUtc: string;
  state: 'active' | 'resolved';
  reason: string;
  resolvedAtUtc?: string;
}

export interface CohortEvaluationSnapshot {
  generatedAtUtc: string;
  source: 'cohort_evaluation_engine';
  baselineCohortId: CohortId;
  window: CohortWindow;
  thresholds: {
    p99LatencyDeltaMs: number;
    errorRateDeltaPct: number;
    degradationRateDeltaPct: number;
  };
  rows: CohortSummary[];
  activeEvents: CohortRegressionEvent[];
  recentEvents: CohortRegressionEvent[];
}

interface CohortRowWire {
  cohort_id: string;
  machine_count: number;
  error_rate_pct: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  degradation_rate_pct: number;
  config_distribution: Record<string, number>;
  delta_error_rate_pct: number;
  delta_p99_latency_ms: number;
  delta_degradation_rate_pct: number;
  confidence: 'low' | 'medium' | 'high';
  trend: Array<{
    timestamp_utc: string;
    error_rate_pct: number;
    p99_latency_ms: number;
    degradation_rate_pct: number;
  }>;
  active_event_count: number;
}

interface CohortEventWire {
  event_id: string;
  correlation_id: string;
  type: 'COHORT_REGRESSION';
  cohort_id: string;
  baseline_cohort_id: string;
  metric: 'error_rate' | 'p99_latency' | 'degradation_rate';
  delta: number;
  threshold: number;
  severity: 'warning' | 'critical';
  confidence: 'low' | 'medium' | 'high';
  machine_count: number;
  window: CohortWindow;
  triggered_at: string;
  last_seen_at: string;
  state: 'active' | 'resolved';
  reason: string;
  resolved_at?: string;
}

interface CohortEvaluationWire {
  generated_at: string;
  source: 'cohort_evaluation_engine';
  baseline_cohort_id: string;
  window: CohortWindow;
  thresholds: {
    p99_latency_delta_ms: number;
    error_rate_delta_pct: number;
    degradation_rate_delta_pct: number;
  };
  rows: CohortRowWire[];
  active_events: CohortEventWire[];
  recent_events: CohortEventWire[];
}

function toCohortId(value: string): CohortId {
  if (value === 'stable' || value === 'canary-1' || value === 'canary-5' || value === 'internal' || value === 'experimental') {
    return value;
  }
  return 'stable';
}

function mapTrendPoint(point: CohortRowWire['trend'][number]): CohortTrendPoint {
  return {
    timestampUtc: point.timestamp_utc,
    errorRatePct: Number(point.error_rate_pct ?? 0),
    p99LatencyMs: Number(point.p99_latency_ms ?? 0),
    degradationRatePct: Number(point.degradation_rate_pct ?? 0)
  };
}

function mapRow(row: CohortRowWire): CohortSummary {
  return {
    cohortId: toCohortId(row.cohort_id),
    nodeCount: Number(row.machine_count ?? 0),
    errorRatePct: Number(row.error_rate_pct ?? 0),
    latencyP50Ms: Number(row.p50_latency_ms ?? 0),
    latencyP95Ms: Number(row.p95_latency_ms ?? 0),
    latencyP99Ms: Number(row.p99_latency_ms ?? 0),
    degradationRatePct: Number(row.degradation_rate_pct ?? 0),
    configSeqDistribution: row.config_distribution ?? {},
    deltaErrorPct: Number(row.delta_error_rate_pct ?? 0),
    deltaP99Ms: Number(row.delta_p99_latency_ms ?? 0),
    deltaDegradationPct: Number(row.delta_degradation_rate_pct ?? 0),
    confidence: row.confidence,
    trend: Array.isArray(row.trend) ? row.trend.map(mapTrendPoint) : [],
    activeEventCount: Number(row.active_event_count ?? 0)
  };
}

function mapEvent(event: CohortEventWire): CohortRegressionEvent {
  return {
    eventId: event.event_id,
    correlationId: event.correlation_id,
    type: event.type,
    cohortId: toCohortId(event.cohort_id),
    baselineCohortId: toCohortId(event.baseline_cohort_id),
    metric: event.metric,
    delta: Number(event.delta ?? 0),
    threshold: Number(event.threshold ?? 0),
    severity: event.severity,
    confidence: event.confidence,
    machineCount: Number(event.machine_count ?? 0),
    window: event.window,
    triggeredAtUtc: event.triggered_at,
    lastSeenAtUtc: event.last_seen_at,
    state: event.state,
    reason: event.reason,
    ...(event.resolved_at ? { resolvedAtUtc: event.resolved_at } : {})
  };
}

function mapEvaluation(wire: CohortEvaluationWire): CohortEvaluationSnapshot {
  return {
    generatedAtUtc: wire.generated_at,
    source: wire.source,
    baselineCohortId: toCohortId(wire.baseline_cohort_id),
    window: wire.window,
    thresholds: {
      p99LatencyDeltaMs: Number(wire.thresholds?.p99_latency_delta_ms ?? 0),
      errorRateDeltaPct: Number(wire.thresholds?.error_rate_delta_pct ?? 0),
      degradationRateDeltaPct: Number(wire.thresholds?.degradation_rate_delta_pct ?? 0)
    },
    rows: Array.isArray(wire.rows) ? wire.rows.map(mapRow) : [],
    activeEvents: Array.isArray(wire.active_events) ? wire.active_events.map(mapEvent) : [],
    recentEvents: Array.isArray(wire.recent_events) ? wire.recent_events.map(mapEvent) : []
  };
}

export async function getCohortEvaluation(
  window: CohortWindow,
  baselineCohortId?: CohortId
): Promise<CohortEvaluationSnapshot> {
  const search = new URLSearchParams({ window });
  if (baselineCohortId) {
    search.set('baseline_cohort_id', baselineCohortId);
  }

  const response = await apiRequestRaw<CohortEvaluationWire>({
    path: `/v1/cohorts/evaluate?${search.toString()}`,
    method: 'get'
  });
  return mapEvaluation(response);
}

export async function getCohortSummary(window: CohortWindow): Promise<CohortSummary[]> {
  const snapshot = await getCohortEvaluation(window);
  return snapshot.rows;
}

// Backend rollout exposure endpoint is separate; keep this as state summary mapping.
export async function getCohortSnapshots(): Promise<CohortSnapshot[]> {
  const state = await getFleetState();
  return [
    { cohortId: 'canary-1', exposurePct: 1, status: state.state },
    { cohortId: 'canary-5', exposurePct: 5, status: state.state },
    { cohortId: 'stable', exposurePct: 94, status: state.state }
  ];
}
