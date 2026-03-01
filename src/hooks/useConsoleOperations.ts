import { useEffect, useMemo, useState } from 'react';
import {
  assignRole,
  deployPolicy,
  exportAudit,
  fetchEffectivePermissions,
  fetchAlerts,
  fetchAuditDecisions,
  fetchConsoleOpsMetrics,
  fetchPolicies,
  fetchRbacAssignments,
  revokeRole,
  resolveAlert,
  replayTrace,
  upsertPolicy
} from '../api/operations';
import { toApiError, type ApiError } from '../api/client';
import type { AlertRecord, AuditDecisionRecord, ConsoleOpsMetrics, PolicyRecord, RbacAssignment } from '../types/consoleOperations';

interface UseConsoleOperationsOptions {
  includeAlertHistory?: boolean;
}

export function useConsoleOperations(options: UseConsoleOperationsOptions = {}) {
  const includeAlertHistory = options.includeAlertHistory ?? false;
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [audits, setAudits] = useState<AuditDecisionRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [assignments, setAssignments] = useState<RbacAssignment[]>([]);
  const [metrics, setMetrics] = useState<ConsoleOpsMetrics>({
    policy_changes_total: 0,
    policy_deploy_failures_total: 0,
    audit_queries_total: 0,
    audit_signature_mismatch_total: 0,
    rbac_violations_total: 0,
    correlation_trace_complete_total: 0,
    correlation_trace_incomplete_total: 0,
    alerts_triggered_total: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  const refresh = async (): Promise<void> => {
    try {
      const [p, a, al, r, m] = await Promise.all([
        fetchPolicies(),
        fetchAuditDecisions(),
        fetchAlerts(includeAlertHistory),
        fetchRbacAssignments(),
        fetchConsoleOpsMetrics()
      ]);
      setPolicies(p);
      setAudits(a);
      setAlerts(al);
      setAssignments(r);
      setMetrics(m);
      setError(undefined);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await refresh();
    };
    void run();
    const timer = window.setInterval(() => void run(), 1000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [includeAlertHistory]);

  const savePolicy = async (policy: PolicyRecord): Promise<void> => {
    await upsertPolicy(policy);
    await refresh();
  };

  const deployPolicyById = async (policyId: string): Promise<void> => {
    await deployPolicy(policyId);
    await refresh();
  };

  const replay = async (traceId: string): Promise<{ result: 'match' | 'mismatch'; details: string }> => {
    return replayTrace(traceId);
  };

  const exportRows = async (format: 'csv' | 'json' | 'pdf_signed', rows: AuditDecisionRecord[]): Promise<void> => {
    await exportAudit(format, rows);
  };

  const assign = async (record: RbacAssignment): Promise<void> => {
    await assignRole(record);
    await refresh();
  };

  const revoke = async (record: Pick<RbacAssignment, 'user_id' | 'role' | 'scope' | 'scope_id'>): Promise<void> => {
    await revokeRole(record);
    await refresh();
  };

  const effectivePermissions = async (userId: string): Promise<string[] | null> => {
    return fetchEffectivePermissions(userId);
  };

  const resolveAlertById = async (alertId: string): Promise<void> => {
    await resolveAlert(alertId);
    await refresh();
  };

  const resolveAlertsByIds = async (alertIds: string[]): Promise<void> => {
    if (alertIds.length === 0) {
      return;
    }

    await Promise.all(alertIds.map((id) => resolveAlert(id)));
    await refresh();
  };

  return useMemo(
    () => ({
      policies,
      audits,
      alerts,
      assignments,
      metrics,
      loading,
      error,
      savePolicy,
      deployPolicyById,
      replay,
      exportRows,
      assign,
      revoke,
      effectivePermissions,
      resolveAlertById,
      resolveAlertsByIds,
      refresh
    }),
    [policies, audits, alerts, assignments, metrics, loading, error]
  );
}
