import { apiRequestRaw } from './client';
import type { CohortId } from '../types/apiContracts';
import type { CohortWindow } from '../types/ui';

export type ExperimentPrimaryMetric = 'overload_likelihood' | 'focus_strength' | 'fatigue_probability';
export type ExperimentGuardrailMetric =
  | 'p99_latency_delta'
  | 'error_rate_delta'
  | 'degradation_delta'
  | 'intervention_thrash_rate';
export type ExperimentVerdictStatus =
  | 'improvement_confirmed'
  | 'regression_detected'
  | 'inconclusive'
  | 'auto_stop_recommended';

export interface ExperimentEvaluationRequest {
  name: string;
  hypothesis: string;
  window: CohortWindow;
  baseline_cohort_id: CohortId;
  experiment_cohort_id: CohortId;
  change_vector?: {
    policy_version?: string;
    config_seq?: number;
    threshold_set?: string;
  };
  primary_metrics: ExperimentPrimaryMetric[];
  guardrails: Array<{
    metric: ExperimentGuardrailMetric;
    threshold: number;
  }>;
  min_sample_machines?: number;
  min_coverage_pct?: number;
  min_window_minutes?: number;
}

export interface ExperimentEvaluation {
  experiment_id: string;
  evaluated_at_utc: string;
  definition: {
    name: string;
    hypothesis: string;
    window: CohortWindow;
    baseline_cohort_id: CohortId;
    experiment_cohort_id: CohortId;
    change_vector?: {
      policy_version?: string;
      config_seq?: number;
      threshold_set?: string;
    };
    primary_metrics: ExperimentPrimaryMetric[];
    guardrails: Array<{
      metric: ExperimentGuardrailMetric;
      threshold: number;
    }>;
    min_sample_machines: number;
    min_coverage_pct: number;
    min_window_minutes: number;
  };
  data_quality: {
    baseline_sample_machines: number;
    experiment_sample_machines: number;
    min_sample_machines: number;
    baseline_coverage_pct: number;
    experiment_coverage_pct: number;
    min_coverage_pct: number;
    window_minutes: number;
    min_window_minutes: number;
    sample_valid: boolean;
    coverage_valid: boolean;
    window_valid: boolean;
    valid: boolean;
    messages: string[];
  };
  metrics: {
    primary: Array<{
      metric: ExperimentPrimaryMetric;
      baseline_value: number | null;
      experiment_value: number | null;
      delta: number | null;
      direction: 'up' | 'down';
      target_delta: number;
      improved: boolean | null;
    }>;
    guardrails: Array<{
      metric: ExperimentGuardrailMetric;
      baseline_value: number | null;
      experiment_value: number | null;
      delta: number | null;
      threshold: number;
      violated: boolean | null;
      strong_violation: boolean | null;
    }>;
    interventions_per_min_delta: {
      baseline_value: number | null;
      experiment_value: number | null;
      delta: number | null;
    };
  };
  confidence: {
    level: 'low' | 'medium' | 'high';
    score: number;
    machine_count: number;
    freshness_seconds: number;
    reasons: string[];
  };
  verdict: {
    status: ExperimentVerdictStatus;
    summary: string;
    triggered_by: string;
    trigger_reason_code:
      | 'INSUFFICIENT_SAMPLE'
      | 'INSUFFICIENT_COVERAGE'
      | 'WINDOW_TOO_SHORT'
      | 'GUARDRAIL_STRONG_VIOLATION'
      | 'GUARDRAIL_VIOLATION'
      | 'IMPROVEMENT_CONFIRMED'
      | 'INCONCLUSIVE_LOW_CONFIDENCE'
      | 'INCONCLUSIVE_NO_PRIMARY_IMPROVEMENT';
    trigger_reason_details: Record<string, string | number | boolean | null>;
    auto_stop_recommended: boolean;
  };
  evidence: {
    correlation_ids: string[];
    related_cohort_events: Array<{
      event_id: string;
      correlation_id: string;
      metric: string;
      severity: 'warning' | 'critical';
      triggered_at: string;
      reason: string;
    }>;
  };
  timeline: {
    baseline: Array<{
      timestamp_utc: string;
      error_rate_pct: number;
      p99_latency_ms: number;
      degradation_rate_pct: number;
    }>;
    experiment: Array<{
      timestamp_utc: string;
      error_rate_pct: number;
      p99_latency_ms: number;
      degradation_rate_pct: number;
    }>;
    markers: Array<{
      timestamp_utc: string;
      type: string;
      severity: 'info' | 'warning' | 'critical';
      message: string;
    }>;
  };
  events: Array<{
    event_id: string;
    type: string;
    occurred_at_utc: string;
    message: string;
    verdict?: ExperimentVerdictStatus;
  }>;
}

export async function evaluateExperiment(request: ExperimentEvaluationRequest): Promise<ExperimentEvaluation> {
  return apiRequestRaw<ExperimentEvaluation>({
    path: '/v1/experiments/evaluate',
    method: 'post',
    body: request
  });
}
