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
  timestamp: string;
  agent_id: string;
  policy_id: string;
  action_decision: 'intervene' | 'skip' | 'cooldown' | 'blocked';
  confidence_score: number;
  triggered_by: string;
  signature_valid: boolean;
  contributing_primitives: string[];
}

export interface RbacAssignment {
  user_id: string;
  role: RoleName;
  scope: 'fleet' | 'agent';
  scope_id: string;
  assigned_at: string;
  assigned_by: string;
}

export interface ConsoleOpsMetrics {
  policy_changes_total: number;
  policy_deploy_failures_total: number;
  audit_queries_total: number;
  audit_signature_mismatch_total: number;
  rbac_violations_total: number;
}

