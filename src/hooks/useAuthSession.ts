import { useEffect, useMemo, useState } from 'react';
import {
  changeAuthPassword,
  generatePasswordResetCode,
  generateSignupCode,
  loginAuth,
  logoutAuth,
  readAuthMe,
  reauthAuth,
  updateAuthProfile,
  type AuthSessionUser
} from '../api/auth';
import { authClient } from '../api/authClient';

interface AuthState {
  ready: boolean;
  authenticated: boolean;
  user: AuthSessionUser | null;
  error: string | null;
}

function errorMessage(input: unknown, fallback: string): string {
  if (input instanceof Error) return input.message;
  if (typeof input === 'object' && input !== null && 'message' in input && typeof input.message === 'string') {
    return input.message;
  }
  return fallback;
}

export function useAuthSession(): AuthState & {
  login: (userId: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  reauth: (password: string) => Promise<boolean>;
  updateProfile: (input: { display_name?: string; avatar_url?: string | null }) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  createSignupCode: (ttlMinutes?: number) => Promise<{ ok: boolean; code: string; expires_at_utc: string } | null>;
  createPasswordResetCode: (userId: string, ttlMinutes?: number) => Promise<{ ok: boolean; user_id: string; code: string; expires_at_utc: string } | null>;
  refresh: () => Promise<void>;
} {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const token = authClient.getAccessToken();
    if (!token) {
      setAuthenticated(false);
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const session = await readAuthMe();
      setAuthenticated(true);
      setUser(session);
      setError(null);
    } catch (err) {
      authClient.clearSession();
      setAuthenticated(false);
      setUser(null);
      setError(errorMessage(err, 'Session expired'));
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!mounted) return;
      await refresh();
    };

    void run();
    const timer = window.setInterval(() => {
      void run();
    }, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const login = async (userId: string, password: string): Promise<boolean> => {
    try {
      const session = await loginAuth(userId, password);
      setAuthenticated(true);
      setUser(session);
      setReady(true);
      setError(null);
      return true;
    } catch (err) {
      setError(errorMessage(err, 'Login failed'));
      setAuthenticated(false);
      setUser(null);
      setReady(true);
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    await logoutAuth();
    setAuthenticated(false);
    setUser(null);
    setError(null);
  };

  const reauth = async (password: string): Promise<boolean> => {
    try {
      const updated = await reauthAuth(password);
      const current = authClient.getSession();
      if (current) {
        setUser({
          user_id: current.user_id,
          role: current.role,
          display_name: current.display_name,
          ...(current.avatar_url !== undefined ? { avatar_url: current.avatar_url } : {}),
          session_expires_at_utc: current.session_expires_at_utc ?? new Date().toISOString(),
          reauth_expires_at_utc: updated.reauth_expires_at_utc
        });
      }
      setError(null);
      return true;
    } catch (err) {
      setError(errorMessage(err, 'Re-auth failed'));
      return false;
    }
  };

  const updateProfile = async (input: { display_name?: string; avatar_url?: string | null }): Promise<boolean> => {
    try {
      const result = await updateAuthProfile(input);
      if (result.ok) {
        const current = authClient.getSession();
        if (current) {
          setUser({
            user_id: current.user_id,
            role: current.role,
            display_name: current.display_name,
            ...(current.avatar_url !== undefined ? { avatar_url: current.avatar_url } : {}),
            session_expires_at_utc: current.session_expires_at_utc ?? new Date().toISOString(),
            reauth_expires_at_utc: current.reauth_expires_at_utc ?? new Date().toISOString()
          });
        }
        setError(null);
      }
      return result.ok;
    } catch (err) {
      setError(errorMessage(err, 'Profile update failed'));
      return false;
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    try {
      const result = await changeAuthPassword(currentPassword, newPassword);
      setError(null);
      return result.ok;
    } catch (err) {
      setError(errorMessage(err, 'Password update failed'));
      return false;
    }
  };

  const createSignupCode = async (ttlMinutes = 30): Promise<{ ok: boolean; code: string; expires_at_utc: string } | null> => {
    try {
      const result = await generateSignupCode(ttlMinutes);
      setError(null);
      return result;
    } catch (err) {
      setError(errorMessage(err, 'Signup code generation failed'));
      return null;
    }
  };

  const createPasswordResetCode = async (
    userId: string,
    ttlMinutes = 30
  ): Promise<{ ok: boolean; user_id: string; code: string; expires_at_utc: string } | null> => {
    try {
      const result = await generatePasswordResetCode(userId, ttlMinutes);
      setError(null);
      return result;
    } catch (err) {
      setError(errorMessage(err, 'Reset code generation failed'));
      return null;
    }
  };

  return useMemo(
    () => ({
      ready,
      authenticated,
      user,
      error,
      login,
      logout,
      reauth,
      updateProfile,
      changePassword,
      createSignupCode,
      createPasswordResetCode,
      refresh
    }),
    [ready, authenticated, user, error]
  );
}
