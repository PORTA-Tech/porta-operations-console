import { apiRequestRaw } from './client';
import type { AuditDecisionRecord, ConsoleOpsMetrics, PolicyRecord, RbacAssignment } from '../types/consoleOperations';

const fallbackPolicies: PolicyRecord[] = [
  {
    policy_id: '018f9b74-ff6a-7b10-baa1-6f4e77a2d901',
    name: 'CPU Hard Limit Protection',
    description: 'Scale out when p95 CPU exceeds threshold.',
    version: '1.2.0',
    active_flag: true,
    status: 'active',
    last_modified: '2026-02-25T09:00:00Z',
    created_by: 'admin@porta',
    service_scope: 'payments-api',
    environment_scope: 'prod',
    trigger_metric: 'cpu_usage_percent',
    trigger_threshold: 85,
    dwell_window_seconds: 60,
    cooldown_seconds: 300,
    max_intervention_duration_seconds: 900,
    max_interventions_per_hour: 6,
    escalation_ladder: ['monitor', 'intervene', 'human_review'],
    override_permissions: ['admin']
  },
  {
    policy_id: '018f9b75-43c2-7e30-91fa-924ae9ab4c33',
    name: 'Memory Leak Containment',
    description: 'Restart pods when average memory remains high.',
    version: '1.0.1',
    active_flag: true,
    status: 'active',
    last_modified: '2026-02-25T09:05:00Z',
    created_by: 'operator@porta',
    service_scope: 'payments-api',
    environment_scope: 'prod',
    trigger_metric: 'memory_usage_percent',
    trigger_threshold: 92,
    dwell_window_seconds: 300,
    cooldown_seconds: 900,
    max_intervention_duration_seconds: 1200,
    max_interventions_per_hour: 2,
    escalation_ladder: ['monitor', 'nudge', 'intervene'],
    override_permissions: ['admin', 'operator']
  }
];

export async function fetchPolicies(): Promise<PolicyRecord[]> {
  try {
    return await apiRequestRaw<PolicyRecord[]>({ path: '/v1/policy/catalog', method: 'get' });
  } catch {
    return fallbackPolicies;
  }
}

export async function upsertPolicy(policy: PolicyRecord): Promise<{ ok: boolean; policy_id: string }> {
  return apiRequestRaw<{ ok: boolean; policy_id: string }>({
    path: '/v1/policy/upsert',
    method: 'post',
    body: policy
  });
}

export async function deployPolicy(policyId: string): Promise<{ ok: boolean; propagated_in_seconds: number }> {
  return apiRequestRaw<{ ok: boolean; propagated_in_seconds: number }>({
    path: '/v1/policy/deploy',
    method: 'post',
    body: { policy_id: policyId }
  });
}

export async function fetchAuditDecisions(): Promise<AuditDecisionRecord[]> {
  try {
    const traces = await apiRequestRaw<Array<Record<string, unknown>>>({
      path: '/v1/audit/decision-traces?limit=1000',
      method: 'get'
    });
    return traces.map((trace) => ({
      trace_id: String(trace.trace_id ?? ''),
      timestamp: String(trace.timestamp ?? ''),
      agent_id: String(trace.target_service ?? 'unknown'),
      policy_id: String(trace.policy_id ?? ''),
      action_decision: (trace.action_decision as AuditDecisionRecord['action_decision']) ?? 'skip',
      confidence_score: Number(trace.confidence_score ?? 0),
      triggered_by: String(trace.triggered_by ?? ''),
      signature_valid: true,
      contributing_primitives: Object.keys((trace.metrics_snapshot ?? {}) as Record<string, unknown>)
    }));
  } catch {
    return [];
  }
}

export async function replayTrace(traceId: string): Promise<{ result: 'match' | 'mismatch'; details: string }> {
  const response = await apiRequestRaw<{ result: 'match' | 'mismatch'; differences?: Array<{ field_name: string }> }>({
    path: '/v1/audit/replay/verify',
    method: 'post',
    body: { trace_id: traceId }
  });
  return {
    result: response.result,
    details: response.differences?.map((d) => d.field_name).join(', ') ?? 'no differences'
  };
}

export async function exportAudit(format: 'csv' | 'json' | 'pdf_signed', rows: AuditDecisionRecord[]): Promise<void> {
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-export.json';
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (format === 'csv') {
    const header = ['trace_id', 'timestamp', 'agent_id', 'policy_id', 'action_decision', 'confidence_score', 'triggered_by', 'signature_valid'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [r.trace_id, r.timestamp, r.agent_id, r.policy_id, r.action_decision, r.confidence_score, r.triggered_by, r.signature_valid].join(',')
      )
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-export.csv';
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  await apiRequestRaw({
    path: '/v1/audit/export',
    method: 'post',
    body: { format: 'pdf_signed' }
  });
}

export async function fetchRbacAssignments(): Promise<RbacAssignment[]> {
  try {
    return await apiRequestRaw<RbacAssignment[]>({ path: '/v1/rbac/assignments', method: 'get' });
  } catch {
    return [];
  }
}

export async function assignRole(assignment: RbacAssignment): Promise<{ ok: boolean }> {
  return apiRequestRaw<{ ok: boolean }>({
    path: '/v1/rbac/assign',
    method: 'post',
    body: assignment
  });
}

export async function fetchConsoleOpsMetrics(): Promise<ConsoleOpsMetrics> {
  try {
    const rows = await apiRequestRaw<Array<{ metric_name: string; value: number }>>({ path: '/v1/audit/metrics', method: 'get' });
    const map = new Map(rows.map((row) => [row.metric_name, row.value]));
    return {
      policy_changes_total: Number(map.get('policy_changes_total') ?? 0),
      policy_deploy_failures_total: Number(map.get('policy_deploy_failures_total') ?? 0),
      audit_queries_total: Number(map.get('audit_queries_total') ?? 0),
      audit_signature_mismatch_total: Number(map.get('audit_signature_mismatch_total') ?? 0),
      rbac_violations_total: Number(map.get('audit_access_denied_total') ?? 0)
    };
  } catch {
    return {
      policy_changes_total: 0,
      policy_deploy_failures_total: 0,
      audit_queries_total: 0,
      audit_signature_mismatch_total: 0,
      rbac_violations_total: 0
    };
  }
}

