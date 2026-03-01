export const authClient = {
  getOperatorAuth(): { operatorId: string; operatorRole: 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer' } {
    const sessionRaw = localStorage.getItem('porta.auth.session');
    if (sessionRaw) {
      try {
        const parsed = JSON.parse(sessionRaw) as {
          user_id?: string;
          role?: 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer';
        };
        if (parsed.user_id && parsed.role) {
          return { operatorId: parsed.user_id, operatorRole: parsed.role };
        }
      } catch {
        // ignore malformed session cache
      }
    }
    return { operatorId: 'anonymous', operatorRole: 'viewer' };
  },

  setOperatorAuth(operatorId: string, operatorRole: 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer'): void {
    localStorage.setItem(
      'porta.auth.session',
      JSON.stringify({
        user_id: operatorId,
        role: operatorRole,
        display_name: operatorId,
        avatar_url: null,
        session_expires_at_utc: null,
        reauth_expires_at_utc: null
      })
    );
  },

  getAccessToken(): string | null {
    return localStorage.getItem('porta.auth.token');
  },

  setSession(input: {
    accessToken: string;
    user_id: string;
    role: 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer';
    display_name: string;
    avatar_url?: string | null;
    session_expires_at_utc: string;
    reauth_expires_at_utc: string;
  }): void {
    localStorage.setItem('porta.auth.token', input.accessToken);
    localStorage.setItem(
      'porta.auth.session',
      JSON.stringify({
        user_id: input.user_id,
        role: input.role,
        display_name: input.display_name,
        avatar_url: input.avatar_url ?? null,
        session_expires_at_utc: input.session_expires_at_utc,
        reauth_expires_at_utc: input.reauth_expires_at_utc
      })
    );
  },

  getSession(): {
    user_id: string;
    role: 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer';
    display_name: string;
    avatar_url?: string | null;
    session_expires_at_utc: string | null;
    reauth_expires_at_utc: string | null;
  } | null {
    const raw = localStorage.getItem('porta.auth.session');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as {
        user_id?: string;
        role?: 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer';
        display_name?: string;
        avatar_url?: string | null;
        session_expires_at_utc?: string | null;
        reauth_expires_at_utc?: string | null;
      };
      if (!parsed.user_id || !parsed.role) return null;
      return {
        user_id: parsed.user_id,
        role: parsed.role,
        display_name: parsed.display_name ?? parsed.user_id,
        ...(typeof parsed.avatar_url === 'string' || parsed.avatar_url === null
          ? { avatar_url: parsed.avatar_url }
          : {}),
        session_expires_at_utc: parsed.session_expires_at_utc ?? null,
        reauth_expires_at_utc: parsed.reauth_expires_at_utc ?? null
      };
    } catch {
      return null;
    }
  },

  clearSession(): void {
    localStorage.removeItem('porta.auth.token');
    localStorage.removeItem('porta.auth.session');
  },

  getRememberedUserId(): string {
    return localStorage.getItem('porta.auth.remembered_user_id') ?? '';
  },

  setRememberedUserId(userId: string): void {
    const trimmed = userId.trim();
    if (!trimmed) {
      localStorage.removeItem('porta.auth.remembered_user_id');
      return;
    }
    localStorage.setItem('porta.auth.remembered_user_id', trimmed);
  }
};
