import { useEffect, useMemo, useState } from 'react';
import {
  assignRole,
  deployPolicy,
  exportAudit,
  fetchAuditDecisions,
  fetchConsoleOpsMetrics,
  fetchPolicies,
  fetchRbacAssignments,
  replayTrace,
  upsertPolicy
} from '../api/operations';
import { toApiError, type ApiError } from '../api/client';
import type { AuditDecisionRecord, ConsoleOpsMetrics, PolicyRecord, RbacAssignment } from '../types/consoleOperations';

export function useConsoleOperations() {
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [audits, setAudits] = useState<AuditDecisionRecord[]>([]);
  const [assignments, setAssignments] = useState<RbacAssignment[]>([]);
  const [metrics, setMetrics] = useState<ConsoleOpsMetrics>({
    policy_changes_total: 0,
    policy_deploy_failures_total: 0,
    audit_queries_total: 0,
    audit_signature_mismatch_total: 0,
    rbac_violations_total: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  const refresh = async (): Promise<void> => {
    try {
      const [p, a, r, m] = await Promise.all([fetchPolicies(), fetchAuditDecisions(), fetchRbacAssignments(), fetchConsoleOpsMetrics()]);
      setPolicies(p);
      setAudits(a);
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
  }, []);

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

  return useMemo(
    () => ({
      policies,
      audits,
      assignments,
      metrics,
      loading,
      error,
      savePolicy,
      deployPolicyById,
      replay,
      exportRows,
      assign,
      refresh
    }),
    [policies, audits, assignments, metrics, loading, error]
  );
}

