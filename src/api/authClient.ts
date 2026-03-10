type OperatorRole = 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer';

const VALID_ROLES = new Set<OperatorRole>(['viewer', 'operator', 'admin', 'auditor', 'developer']);
const DEFAULT_OPERATOR_ID = import.meta.env.VITE_OPERATOR_ID?.trim() || 'porta-console';
const DEFAULT_OPERATOR_ROLE = normalizeOperatorRole(import.meta.env.VITE_OPERATOR_ROLE) ?? 'admin';

function normalizeOperatorRole(value: unknown): OperatorRole | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return VALID_ROLES.has(normalized as OperatorRole) ? normalized as OperatorRole : null;
}

function readStoredOperator(): { operatorId: string; operatorRole: OperatorRole } | null {
  if (typeof window === 'undefined') return null;

  const directOperatorId = window.localStorage.getItem('porta.auth.operator_id')?.trim() ?? '';
  const directOperatorRole = normalizeOperatorRole(window.localStorage.getItem('porta.auth.operator_role'));
  if (directOperatorId.length > 0 && directOperatorRole) {
    return {
      operatorId: directOperatorId,
      operatorRole: directOperatorRole
    };
  }

  const sessionRaw = window.localStorage.getItem('porta.auth.session');
  if (!sessionRaw) return null;

  try {
    const parsed = JSON.parse(sessionRaw) as Record<string, unknown>;
    const operatorId = typeof parsed.operatorId === 'string' && parsed.operatorId.trim().length > 0
      ? parsed.operatorId.trim()
      : typeof parsed.userId === 'string' && parsed.userId.trim().length > 0
        ? parsed.userId.trim()
        : typeof parsed.actorId === 'string' && parsed.actorId.trim().length > 0
          ? parsed.actorId.trim()
          : '';
    const operatorRole = normalizeOperatorRole(parsed.operatorRole ?? parsed.role ?? parsed.userRole);

    if (operatorId.length > 0 && operatorRole) {
      return {
        operatorId,
        operatorRole
      };
    }
  } catch {
    return null;
  }

  return null;
}

export const authClient = {
  getOperatorAuth(): { operatorId: string; operatorRole: OperatorRole } {
    return readStoredOperator() ?? {
      operatorId: DEFAULT_OPERATOR_ID,
      operatorRole: DEFAULT_OPERATOR_ROLE
    };
  },

  clearSession(): void {
    localStorage.removeItem('porta.auth.token');
    localStorage.removeItem('porta.auth.session');
    localStorage.removeItem('porta.auth.remembered_user_id');
  }
};
