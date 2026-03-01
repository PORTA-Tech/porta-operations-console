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
  rawErrorRatePct: number | null;
  rawLatencyP50Ms: number | null;
  rawLatencyP95Ms: number | null;
  rawLatencyP99Ms: number | null;
  rawDegradationRatePct: number | null;
  rawDeltaErrorPct: number | null;
  rawDeltaP99Ms: number | null;
  rawDeltaDegradationPct: number | null;
  metricsAvailable: boolean;
  availabilityReasonCode?: string;
  confidence: 'low' | 'medium' | 'high';
  trend: CohortTrendPoint[];
  activeEventCount: number;
}

type Primitive = string | number | boolean | null;

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
  triggerReasonCode?: string;
  triggerReasonDetails?: Record<string, Primitive>;
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
  dataQuality?: {
    minSampleMachines: number | null;
    minCoveragePct: number | null;
    freshnessSeconds: number | null;
    freshnessOk: boolean | null;
    wsStreamOk: boolean | null;
    metricsAvailable: boolean | null;
    valid: boolean | null;
    messages: string[];
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
  metrics_available?: boolean;
  availability_reason_code?: string;
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
  trigger_reason_code?: string;
  trigger_reason_details?: Record<string, Primitive>;
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
  data_quality?: {
    min_sample_machines?: number | null;
    min_coverage_pct?: number | null;
    freshness_seconds?: number | null;
    freshness_ok?: boolean | null;
    ws_stream_ok?: boolean | null;
    metrics_available?: boolean | null;
    valid?: boolean | null;
    messages?: string[];
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

function toNullableNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  return Number.isFinite(value) ? value : null;
}

function mapRow(row: CohortRowWire): CohortSummary {
  const rawErrorRatePct = toNullableNumber(row.error_rate_pct);
  const rawLatencyP50Ms = toNullableNumber(row.p50_latency_ms);
  const rawLatencyP95Ms = toNullableNumber(row.p95_latency_ms);
  const rawLatencyP99Ms = toNullableNumber(row.p99_latency_ms);
  const rawDegradationRatePct = toNullableNumber(row.degradation_rate_pct);
  const rawDeltaErrorPct = toNullableNumber(row.delta_error_rate_pct);
  const rawDeltaP99Ms = toNullableNumber(row.delta_p99_latency_ms);
  const rawDeltaDegradationPct = toNullableNumber(row.delta_degradation_rate_pct);
  const metricsAvailable =
    typeof row.metrics_available === 'boolean'
      ? row.metrics_available
      : rawErrorRatePct !== null
        && rawLatencyP50Ms !== null
        && rawLatencyP95Ms !== null
        && rawLatencyP99Ms !== null
        && rawDegradationRatePct !== null;

  return {
    cohortId: toCohortId(row.cohort_id),
    nodeCount: Number(row.machine_count ?? 0),
    errorRatePct: rawErrorRatePct ?? 0,
    latencyP50Ms: rawLatencyP50Ms ?? 0,
    latencyP95Ms: rawLatencyP95Ms ?? 0,
    latencyP99Ms: rawLatencyP99Ms ?? 0,
    degradationRatePct: rawDegradationRatePct ?? 0,
    configSeqDistribution: row.config_distribution ?? {},
    deltaErrorPct: rawDeltaErrorPct ?? 0,
    deltaP99Ms: rawDeltaP99Ms ?? 0,
    deltaDegradationPct: rawDeltaDegradationPct ?? 0,
    rawErrorRatePct,
    rawLatencyP50Ms,
    rawLatencyP95Ms,
    rawLatencyP99Ms,
    rawDegradationRatePct,
    rawDeltaErrorPct,
    rawDeltaP99Ms,
    rawDeltaDegradationPct,
    metricsAvailable,
    ...(row.availability_reason_code ? { availabilityReasonCode: row.availability_reason_code } : {}),
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
    ...(event.resolved_at ? { resolvedAtUtc: event.resolved_at } : {}),
    ...(event.trigger_reason_code ? { triggerReasonCode: event.trigger_reason_code } : {}),
    ...(event.trigger_reason_details ? { triggerReasonDetails: event.trigger_reason_details } : {})
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
    ...(wire.data_quality
      ? {
          dataQuality: {
            minSampleMachines: toNullableNumber(wire.data_quality.min_sample_machines),
            minCoveragePct: toNullableNumber(wire.data_quality.min_coverage_pct),
            freshnessSeconds: toNullableNumber(wire.data_quality.freshness_seconds),
            freshnessOk: typeof wire.data_quality.freshness_ok === 'boolean' ? wire.data_quality.freshness_ok : null,
            wsStreamOk: typeof wire.data_quality.ws_stream_ok === 'boolean' ? wire.data_quality.ws_stream_ok : null,
            metricsAvailable: typeof wire.data_quality.metrics_available === 'boolean' ? wire.data_quality.metrics_available : null,
            valid: typeof wire.data_quality.valid === 'boolean' ? wire.data_quality.valid : null,
            messages: Array.isArray(wire.data_quality.messages) ? wire.data_quality.messages : []
          }
        }
      : {}),
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
