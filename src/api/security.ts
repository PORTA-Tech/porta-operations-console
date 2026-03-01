import { apiRequestRaw } from './client';

export interface SecurityPermissionMatrixRow {
  role: string;
  read: boolean;
  write: boolean;
  override: boolean;
  sensitive_actions: string[];
}

export interface SecurityPermissionMatrixView {
  rows: SecurityPermissionMatrixRow[];
  source: string;
  updated_at_utc: string | null;
  visibility?: 'full' | 'restricted';
  scoped_role?: string | null;
}

export interface SecurityRoleView {
  role: string;
  description: string | null;
  sensitive_actions: string[];
}

export interface SensitiveOpsPolicyView {
  reauth_window_minutes: number;
  require_2fa_override: boolean;
  sensitive_actions: string[];
  blocked_missing_reauth_last_1h: number;
  expired_sessions: number;
  source: string;
  updated_at_utc: string | null;
}

export interface SecurityEventWire {
  timestamp_utc: string;
  user_id: string | null;
  role: string | null;
  attempted_action: string;
  resource: string | null;
  scope: string | null;
  scope_id: string | null;
  result: 'DENIED' | 'ALLOWED' | 'UNKNOWN';
  reason_code: string | null;
  correlation_id: string | null;
  trace_id: string | null;
}

export async function getSecurityRoles(): Promise<SecurityRoleView[] | null> {
  try {
    const payload = await apiRequestRaw<unknown>({ path: '/v1/security/roles', method: 'get' });
    if (Array.isArray(payload)) {
      return payload.map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        return {
          role: String(row.role ?? row.id ?? 'unknown'),
          description: typeof row.description === 'string' ? row.description : null,
          sensitive_actions: Array.isArray(row.sensitive_actions)
            ? row.sensitive_actions.map((value) => String(value))
            : Array.isArray(row.sensitiveActions)
              ? row.sensitiveActions.map((value) => String(value))
              : []
        };
      });
    }
    return null;
  } catch {
    return null;
  }
}

export async function getSecurityPermissionsMatrix(): Promise<SecurityPermissionMatrixView | null> {
  try {
    const payload = await apiRequestRaw<unknown>({ path: '/v1/security/permissions-matrix', method: 'get' });
    const root = (payload ?? {}) as Record<string, unknown>;
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(root.rows)
        ? root.rows
        : Array.isArray(root.matrix)
          ? root.matrix
          : [];
    if (list.length === 0) return null;

    const rows = list.map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const permissions = Array.isArray(row.permissions)
        ? row.permissions.map((value) => String(value).toLowerCase())
        : [];
      return {
        role: String(row.role ?? row.role_id ?? row.id ?? 'unknown'),
        read: typeof row.read === 'boolean' ? row.read : permissions.includes('read'),
        write: typeof row.write === 'boolean' ? row.write : permissions.includes('write'),
        override: typeof row.override === 'boolean' ? row.override : permissions.includes('override'),
        sensitive_actions: Array.isArray(row.sensitive_actions)
          ? row.sensitive_actions.map((value) => String(value))
          : Array.isArray(row.sensitiveActions)
            ? row.sensitiveActions.map((value) => String(value))
            : []
      } satisfies SecurityPermissionMatrixRow;
    });

    const updatedAtUtc = typeof root.updated_at_utc === 'string'
      ? root.updated_at_utc
      : typeof root.updatedAtUtc === 'string'
        ? root.updatedAtUtc
        : null;
    const source = typeof root.source === 'string' ? root.source : 'security_api';
    const visibility = root.visibility === 'restricted' ? 'restricted' : 'full';
    const scopedRole = typeof root.scoped_role === 'string' ? root.scoped_role : null;
    return {
      rows,
      source,
      updated_at_utc: updatedAtUtc,
      visibility,
      scoped_role: scopedRole
    };
  } catch {
    return null;
  }
}

export async function getSensitiveOpsPolicy(): Promise<SensitiveOpsPolicyView | null> {
  try {
    const payload = await apiRequestRaw<unknown>({ path: '/v1/security/sensitive-policy', method: 'get' });
    const row = (payload ?? {}) as Record<string, unknown>;
    const reauthWindow = Number(row.reauth_window_minutes ?? row.reauthWindowMinutes ?? 10);
    const blockedCount = Number(row.blocked_missing_reauth_last_1h ?? row.blockedMissingReauthLast1h ?? 0);
    const expiredSessions = Number(row.expired_sessions ?? row.expiredSessions ?? 0);
    return {
      reauth_window_minutes: Number.isFinite(reauthWindow) ? Math.max(1, Math.trunc(reauthWindow)) : 10,
      require_2fa_override: Boolean(row.require_2fa_override ?? row.require2faOverride ?? false),
      sensitive_actions: Array.isArray(row.sensitive_actions)
        ? row.sensitive_actions.map((value) => String(value))
        : Array.isArray(row.sensitiveActions)
          ? row.sensitiveActions.map((value) => String(value))
          : [],
      blocked_missing_reauth_last_1h: Number.isFinite(blockedCount) ? blockedCount : 0,
      expired_sessions: Number.isFinite(expiredSessions) ? expiredSessions : 0,
      source: typeof row.source === 'string' ? row.source : 'security_api',
      updated_at_utc: typeof row.updated_at_utc === 'string'
        ? row.updated_at_utc
        : typeof row.updatedAtUtc === 'string'
          ? row.updatedAtUtc
          : null
    };
  } catch {
    return null;
  }
}

export async function updateSensitiveOpsPolicy(next: {
  reauth_window_minutes: number;
  require_2fa_override: boolean;
}): Promise<boolean> {
  try {
    await apiRequestRaw<unknown>({
      path: '/v1/security/sensitive-policy/update',
      method: 'post',
      body: next
    });
    return true;
  } catch {
    return false;
  }
}

export async function getSecurityEvents(window: '15m' | '1h' | '24h'): Promise<SecurityEventWire[] | null> {
  try {
    const payload = await apiRequestRaw<unknown>({
      path: `/v1/security/events?window=${window}`,
      method: 'get'
    });
    if (!Array.isArray(payload)) return null;
    return payload.map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const resultRaw = String(row.result ?? row.outcome ?? 'UNKNOWN').toUpperCase();
      const result = resultRaw === 'DENIED' || resultRaw === 'ALLOWED' ? resultRaw : 'UNKNOWN';
      return {
        timestamp_utc: String(row.timestamp_utc ?? row.timestamp ?? new Date().toISOString()),
        user_id: typeof row.user_id === 'string' ? row.user_id : typeof row.userId === 'string' ? row.userId : null,
        role: typeof row.role === 'string' ? row.role : null,
        attempted_action: String(row.attempted_action ?? row.action ?? 'unknown'),
        resource: typeof row.resource === 'string' ? row.resource : null,
        scope: typeof row.scope === 'string' ? row.scope : null,
        scope_id: typeof row.scope_id === 'string' ? row.scope_id : typeof row.scopeId === 'string' ? row.scopeId : null,
        result,
        reason_code: typeof row.reason_code === 'string' ? row.reason_code : typeof row.reasonCode === 'string' ? row.reasonCode : null,
        correlation_id: typeof row.correlation_id === 'string'
          ? row.correlation_id
          : typeof row.correlationId === 'string'
            ? row.correlationId
            : null,
        trace_id: typeof row.trace_id === 'string' ? row.trace_id : typeof row.traceId === 'string' ? row.traceId : null
      };
    });
  } catch {
    return null;
  }
}
