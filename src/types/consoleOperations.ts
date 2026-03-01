export type PolicyStatus = 'active' | 'inactive' | 'error';
export type EscalationStep = 'monitor' | 'nudge' | 'intervene' | 'human_review';
export type RoleName = 'admin' | 'operator' | 'auditor' | 'developer';
export type Permission = 'read' | 'write' | 'override';

export interface PolicyRecord {
  policy_id: string;
  name: string;
  description: string;
  version: string;
  active_flag: boolean;
  status: PolicyStatus;
  last_modified: string;
  created_by: string;
  service_scope: string;
  environment_scope: string;
  trigger_metric: string;
  trigger_threshold: number;
  dwell_window_seconds: number;
  cooldown_seconds: number;
  max_intervention_duration_seconds: number;
  max_interventions_per_hour: number;
  escalation_ladder: EscalationStep[];
  override_permissions: RoleName[];
}

export interface AuditDecisionRecord {
  trace_id: string;
  correlation_id: string;
  timestamp: string;
  agent_id: string;
  policy_id: string;
  action_decision: 'intervene' | 'skip' | 'cooldown' | 'blocked';
  confidence_score: number;
  triggered_by: string;
  signature_valid: boolean;
  signature_status?: 'VALID' | 'INVALID' | 'UNKNOWN';
  cohort_id?: string | null;
  machine_id?: string | null;
  reason_code?: string | null;
  policy_version?: string | null;
  trace_generated?: boolean;
  evidence_available?: boolean;
  escalation_level?: string | null;
  config_version?: number | null;
  trace_status?: 'complete' | 'incomplete' | 'unknown';
  signature_verification_status?: 'verified' | 'failed' | 'not_verified';
  missing_segments?: string[] | null;
  raw_trace?: Record<string, unknown>;
  contributing_primitives: string[];
}

export interface AlertRecord {
  alert_id: string;
  alert_type:
    | 'agent_offline'
    | 'backend_disconnected'
    | 'signature_invalid'
    | 'config_drift'
    | 'slo_breach'
    | 'cohort_regression_spike'
    | 'policy_thrash'
    | 'circuit_breaker_open'
    | 'ws_drop_spikes'
    | 'high_stress_probability'
    | 'overload_probability'
    | 'intervention_failure'
    | 'policy_version_mismatch'
    | 'signature_verification_failure'
    | 'latency_breach'
    | string;
  severity: 'info' | 'warning' | 'critical';
  status: 'active' | 'resolved';
  first_seen_at: string;
  last_seen_at: string;
  target_service: string;
  correlation_id: string;
  threshold: string;
  reason: string;
}

export interface RbacAssignment {
  user_id: string;
  role: RoleName;
  scope: 'fleet' | 'agent';
  scope_id: string;
  assigned_at: string;
  assigned_by: string;
  expires_at?: string;
  reason?: string;
}

export interface ConsoleOpsMetrics {
  policy_changes_total: number;
  policy_deploy_failures_total: number;
  audit_queries_total: number;
  audit_signature_mismatch_total: number;
  rbac_violations_total: number;
  correlation_trace_complete_total: number;
  correlation_trace_incomplete_total: number;
  alerts_triggered_total: number;
}
