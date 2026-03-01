import { apiRequestRaw } from './client';
import type { AlertRecord, AuditDecisionRecord, ConsoleOpsMetrics, PolicyRecord, RbacAssignment } from '../types/consoleOperations';

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
    const readString = (value: unknown): string | null => {
      return typeof value === 'string' && value.trim().length > 0 ? value : null;
    };
    const readNumber = (value: unknown): number | null => {
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    };

    const normalizeDecision = (raw: unknown): AuditDecisionRecord['action_decision'] => {
      const value = typeof raw === 'string' ? raw.toLowerCase() : '';
      if (value === 'intervene' || value === 'allow') return 'intervene';
      if (value === 'blocked' || value === 'block') return 'blocked';
      if (value === 'cooldown' || value === 'no_op' || value === 'noop') return 'cooldown';
      return 'skip';
    };

    const normalizeSignatureStatus = (raw: unknown, fallback: boolean): 'VALID' | 'INVALID' | 'UNKNOWN' => {
      if (typeof raw !== 'string') {
        return fallback ? 'VALID' : 'INVALID';
      }
      const value = raw.toUpperCase();
      if (value === 'VALID' || value === 'INVALID' || value === 'UNKNOWN') {
        return value;
      }
      return fallback ? 'VALID' : 'INVALID';
    };

    const normalizeTraceStatus = (raw: unknown, missingSegments: string[] | null): 'complete' | 'incomplete' | 'unknown' => {
      if (typeof raw === 'string') {
        const normalized = raw.toLowerCase();
        if (normalized === 'complete' || normalized === 'completed') return 'complete';
        if (normalized === 'incomplete' || normalized === 'partial') return 'incomplete';
      }
      if (typeof raw === 'boolean') {
        return raw ? 'complete' : 'incomplete';
      }
      if (missingSegments && missingSegments.length > 0) return 'incomplete';
      return 'unknown';
    };

    const normalizeSignatureVerification = (
      raw: unknown,
      signatureStatus: 'VALID' | 'INVALID' | 'UNKNOWN'
    ): 'verified' | 'failed' | 'not_verified' => {
      if (typeof raw === 'string') {
        const normalized = raw.toLowerCase();
        if (normalized === 'verified' || normalized === 'pass') return 'verified';
        if (normalized === 'failed' || normalized === 'fail') return 'failed';
        if (normalized === 'not_verified' || normalized === 'pending') return 'not_verified';
      }
      if (typeof raw === 'boolean') {
        return raw ? 'verified' : 'failed';
      }
      if (signatureStatus === 'VALID') return 'verified';
      if (signatureStatus === 'INVALID') return 'failed';
      return 'not_verified';
    };

    return traces.map((trace) => {
      const signatureStatus = normalizeSignatureStatus(
        trace.signature_status,
        Boolean(trace.signature_valid ?? trace.config_signature_valid ?? true)
      );
      const missingSegments = Array.isArray(trace.missing_segments)
        ? trace.missing_segments
            .filter((segment): segment is string => typeof segment === 'string' && segment.trim().length > 0)
            .map((segment) => segment.trim())
        : null;
      return {
        trace_id: String(trace.trace_id ?? ''),
        correlation_id: String(trace.correlation_id ?? ''),
        timestamp: String(trace.timestamp ?? ''),
        agent_id: String(trace.agent_id ?? trace.machine_id ?? trace.target_service ?? 'unknown'),
        policy_id: String(trace.policy_id ?? ''),
        action_decision: normalizeDecision(trace.action_decision ?? trace.decision),
        confidence_score: Number(trace.confidence_score ?? 0),
        triggered_by: String(trace.triggered_by ?? trace.reason_code ?? ''),
        signature_valid: Boolean(trace.signature_valid ?? trace.config_signature_valid ?? true),
        signature_status: signatureStatus,
        cohort_id: typeof trace.cohort_id === 'string'
          ? trace.cohort_id
          : typeof trace.cohort === 'string'
            ? trace.cohort
            : null,
        machine_id: typeof trace.machine_id === 'string' ? trace.machine_id : null,
        reason_code: typeof trace.reason_code === 'string' ? trace.reason_code : null,
        policy_version: typeof trace.policy_version === 'string' ? trace.policy_version : null,
        trace_generated: typeof trace.trace_generated === 'boolean'
          ? trace.trace_generated
          : String(trace.trace_id ?? '').length > 0,
        evidence_available: typeof trace.evidence_available === 'boolean'
          ? trace.evidence_available
          : String(trace.trace_id ?? '').length > 0 || String(trace.correlation_id ?? '').length > 0,
        escalation_level: readString(trace.escalation_level) ?? readString(trace.escalation) ?? readString(trace.action_level),
        config_version:
          readNumber(trace.config_seq)
          ?? readNumber(trace.config_version)
          ?? readNumber(trace.policy_seq),
        trace_status: normalizeTraceStatus(trace.trace_status ?? trace.trace_complete, missingSegments),
        signature_verification_status: normalizeSignatureVerification(
          trace.signature_verification_status ?? trace.signature_verified,
          signatureStatus
        ),
        missing_segments: missingSegments,
        raw_trace: trace,
        contributing_primitives: Object.keys((trace.metrics_snapshot ?? trace.primitives ?? {}) as Record<string, unknown>)
      };
    });
  } catch {
    return [];
  }
}

export async function fetchAlerts(includeHistory = false): Promise<AlertRecord[]> {
  try {
    return await apiRequestRaw<AlertRecord[]>({
      path: `/v1/audit/alerts?limit=1000&include_history=${includeHistory ? 'true' : 'false'}`,
      method: 'get'
    });
  } catch {
    return [];
  }
}

export async function resolveAlert(alertId: string): Promise<AlertRecord> {
  return apiRequestRaw<AlertRecord>({
    path: `/v1/audit/alerts/${encodeURIComponent(alertId)}/resolve`,
    method: 'post'
  });
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

export async function revokeRole(assignment: Pick<RbacAssignment, 'user_id' | 'role' | 'scope' | 'scope_id'>): Promise<{ ok: boolean }> {
  return apiRequestRaw<{ ok: boolean }>({
    path: '/v1/rbac/revoke',
    method: 'post',
    body: assignment
  });
}

export async function fetchEffectivePermissions(userId: string): Promise<string[] | null> {
  try {
    const payload = await apiRequestRaw<unknown>({
      path: `/v1/rbac/effective-permissions?user_id=${encodeURIComponent(userId)}`,
      method: 'get'
    });
    const root = (payload ?? {}) as Record<string, unknown>;
    const list = Array.isArray(root.permissions)
      ? root.permissions
      : Array.isArray(payload)
        ? payload
        : [];
    return list.map((value) => String(value));
  } catch {
    return null;
  }
}

export async function fetchConsoleOpsMetrics(): Promise<ConsoleOpsMetrics> {
  try {
    const rows = await apiRequestRaw<Array<{ metric_name: string; value: number }>>({ path: '/v1/audit/metrics', method: 'get' });
    const totals = new Map<string, number>();
    for (const row of rows) {
      totals.set(row.metric_name, (totals.get(row.metric_name) ?? 0) + Number(row.value ?? 0));
    }
    return {
      policy_changes_total: Number(totals.get('policy_changes_total') ?? 0),
      policy_deploy_failures_total: Number(totals.get('policy_deploy_failures_total') ?? 0),
      audit_queries_total: Number(totals.get('audit_queries_total') ?? 0),
      audit_signature_mismatch_total: Number(totals.get('audit_signature_mismatch_total') ?? 0),
      rbac_violations_total: Number(totals.get('audit_access_denied_total') ?? 0),
      correlation_trace_complete_total: Number(totals.get('correlation_trace_complete_total') ?? 0),
      correlation_trace_incomplete_total: Number(totals.get('correlation_trace_incomplete_total') ?? 0),
      alerts_triggered_total: Number(totals.get('alerts_triggered_total') ?? 0)
    };
  } catch {
    return {
      policy_changes_total: 0,
      policy_deploy_failures_total: 0,
      audit_queries_total: 0,
      audit_signature_mismatch_total: 0,
      rbac_violations_total: 0,
      correlation_trace_complete_total: 0,
      correlation_trace_incomplete_total: 0,
      alerts_triggered_total: 0
    };
  }
}
