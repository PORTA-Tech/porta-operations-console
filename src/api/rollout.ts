import type { RolloutStatusView } from '../types/apiContracts';
import { apiRequest, apiRequestRaw } from './client';
import type { components } from './generated/controlPlane';

export type RolloutMutationResult = {
  rollout_state: RolloutStatusView['state'];
  config_seq: RolloutStatusView['activeConfigSeq'];
  cooldown_until_utc: string | undefined;
  halt_status: boolean;
  updated_at_utc: string;
};

export type RolloutDryRunView = components['schemas']['RolloutDryRunView'];

export type RolloutGuardrailStatus = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'NOT_APPLICABLE';
export type RolloutPromotionVerdict = 'ALLOW' | 'BLOCK' | 'INCONCLUSIVE';
export type RolloutEvaluationEventType =
  | 'RolloutEvaluationComputed'
  | 'PromotionBlocked'
  | 'PromotionAllowed'
  | 'PromotionRequested'
  | 'PromotionExecuted'
  | 'MonitoringStarted'
  | 'GuardrailFailed'
  | 'CooldownActivated'
  | 'HaltRaised'
  | 'RollbackStarted'
  | 'RollbackCompleted'
  | 'RolloutEvent';

export type RolloutEvaluationPermissions = {
  can_promote: boolean;
  can_halt: boolean;
  can_export_evidence: boolean;
  can_view_replay_logs: boolean;
  blocked_reason_code?: string;
  blocked_reason_details?: Record<string, string | number | boolean | null>;
  by_action?: Partial<Record<'promote' | 'halt' | 'rollback' | 'export_evidence' | 'view_replay_logs', {
    allowed: boolean;
    blocked_reason_code?: string;
    blocked_reason_details?: Record<string, string | number | boolean | null>;
  }>>;
};

export type RolloutEvaluation = {
  rollout_state: RolloutStatusView['state'];
  halt_status: boolean;
  current_stage: 'CANARY' | 'LIMITED' | 'MAJORITY' | 'FULL';
  next_stage: 'CANARY' | 'LIMITED' | 'MAJORITY' | 'FULL' | null;
  config_version: number;
  cooldown_until_utc: string | null;
  evaluated_at_utc: string;
  data_quality: {
    baseline_cohort_id: string;
    target_cohort_id: string;
    sample_size_by_cohort: Record<string, number>;
    coverage_pct_by_cohort: Record<string, number>;
    min_sample_machines: number;
    min_coverage_pct: number;
    freshness_seconds: number | null;
    freshness_ok: boolean;
    ws_stream_ok: boolean;
    metrics_available: boolean;
    trust_status: 'VALID' | 'INVALID' | 'UNKNOWN';
    trust?: {
      status: 'VALID' | 'INVALID' | 'PARTIAL' | 'UNKNOWN';
      reason_code?: string;
      affected_nodes_count: number | null;
      issuer: string | null;
    };
    sample_valid: boolean;
    coverage_valid: boolean;
    valid: boolean;
    messages: string[];
  };
  guardrail_eval: Array<{
    guardrail_id: string;
    status: RolloutGuardrailStatus;
    value: number | null;
    value_label: string;
    threshold: number | null;
    threshold_label: string;
    window: string;
    evidence: {
      correlation_ids: string[];
      cohorts: string[];
      trace_refs: string[];
    };
    reason_code?: string;
    reason_details?: Record<string, string | number | boolean | null>;
  }>;
  decision: {
    promotion_verdict: RolloutPromotionVerdict;
    trigger_reason_code: string;
    trigger_reason_details: Record<string, string | number | boolean | null>;
    evaluated_at_utc: string;
  };
  blast_radius: {
    node_count: number | null;
    impacted_cohorts: string[];
    confidence: 'low' | 'medium' | 'high' | 'unknown';
    generated_at_utc: string;
    availability_reason_code?: string;
  };
  dry_run_prediction: {
    error_rate_delta_pct: number | null;
    p99_latency_delta_ms: number | null;
    degradation_rate_delta_pct: number | null;
    generated_at_utc: string;
    availability_reason_code?: string;
  };
  rollout_stage_progression_preview: RolloutStatusView['state'][];
  events: Array<{
    event_id: string;
    type: RolloutEvaluationEventType | string;
    timestamp_utc: string;
    actor: string;
    config_version: number;
    cohorts: string[];
    correlation_ids: string[];
    details: string;
    details_map?: Record<string, string | number | boolean | null>;
    duplicate_count?: number;
  }>;
  evidence: {
    correlation_ids: string[];
    available: boolean;
    generated_at_utc: string;
    export_url?: string;
  };
  permissions?: RolloutEvaluationPermissions;
};

export type RolloutEvidencePack = {
  generated_at_utc: string;
  evaluation: RolloutEvaluation;
  cohort_snapshot: unknown;
  event_stream: RolloutEvaluation['events'];
  guardrail_eval: RolloutEvaluation['guardrail_eval'];
  correlation_ids: string[];
};

export async function getRolloutState(): Promise<RolloutStatusView> {
  return apiRequest({ path: '/v1/rollout/state', method: 'get' });
}

export async function getRolloutDryRun(): Promise<RolloutDryRunView> {
  return apiRequest({ path: '/v1/rollout/dry-run', method: 'get' });
}

export async function getRolloutEvaluation(): Promise<RolloutEvaluation> {
  return apiRequestRaw<RolloutEvaluation>({ path: '/v1/rollout/evaluate', method: 'get' });
}

export async function getRolloutEvidencePack(limit = 200): Promise<RolloutEvidencePack> {
  return apiRequestRaw<RolloutEvidencePack>({
    path: `/v1/rollout/evidence-pack?limit=${Math.max(1, Math.min(1000, Math.trunc(limit)))}`,
    method: 'get'
  });
}

function toMutationResult(state: RolloutStatusView): RolloutMutationResult {
  return {
    rollout_state: state.state,
    config_seq: state.activeConfigSeq,
    cooldown_until_utc: state.cooldownUntilUtc,
    halt_status: state.state === 'HALTED' || state.state === 'ROLLED_BACK' || state.state === 'COOLDOWN',
    updated_at_utc: state.updatedAtUtc
  };
}

async function mutateAndRead(
  path: '/v1/rollout/promote' | '/v1/rollout/halt' | '/v1/rollout/rollback'
): Promise<RolloutMutationResult> {
  await apiRequest({ path, method: 'post' });
  const state = await getRolloutState();
  return toMutationResult(state);
}

export async function promoteRollout(): Promise<RolloutMutationResult> {
  return mutateAndRead('/v1/rollout/promote');
}

export async function haltRollout(): Promise<RolloutMutationResult> {
  return mutateAndRead('/v1/rollout/halt');
}

export async function rollbackRollout(): Promise<RolloutMutationResult> {
  return mutateAndRead('/v1/rollout/rollback');
}

export async function initiatePromotion(): Promise<RolloutMutationResult> {
  return promoteRollout();
}

export async function pauseRollout(): Promise<RolloutMutationResult> {
  return haltRollout();
}

export async function resumeRollout(): Promise<RolloutMutationResult> {
  return promoteRollout();
}

export async function forceRollback(): Promise<RolloutMutationResult> {
  return rollbackRollout();
}
