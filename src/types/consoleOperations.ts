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
