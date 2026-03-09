import { apiRequestRaw } from './client';
import type { AlertRecord, AuditDecisionRecord } from '../types/consoleOperations';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeDecision(raw: unknown): AuditDecisionRecord['action_decision'] {
  const value = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (value === 'intervene' || value === 'allow') return 'intervene';
  if (value === 'blocked' || value === 'block') return 'blocked';
  if (value === 'cooldown' || value === 'no_op' || value === 'noop') return 'cooldown';
  return 'skip';
}

function normalizeSignatureStatus(raw: unknown, fallback: boolean): 'VALID' | 'INVALID' | 'UNKNOWN' {
  if (typeof raw !== 'string') {
    return fallback ? 'VALID' : 'INVALID';
  }

  const value = raw.toUpperCase();
  if (value === 'VALID' || value === 'INVALID' || value === 'UNKNOWN') {
    return value;
  }

  return fallback ? 'VALID' : 'INVALID';
}

function normalizeTraceStatus(raw: unknown, missingSegments: string[] | null): 'complete' | 'incomplete' | 'unknown' {
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
}

function normalizeSignatureVerification(
  raw: unknown,
  signatureStatus: 'VALID' | 'INVALID' | 'UNKNOWN'
): 'verified' | 'failed' | 'not_verified' {
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
}

export async function fetchAuditDecisions(): Promise<AuditDecisionRecord[]> {
  try {
    const traces = await apiRequestRaw<Array<Record<string, unknown>>>({
      path: '/v1/audit/decision-traces?limit=1000',
      method: 'get'
    });

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
        config_version: readNumber(trace.config_seq) ?? readNumber(trace.config_version) ?? readNumber(trace.policy_seq),
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
