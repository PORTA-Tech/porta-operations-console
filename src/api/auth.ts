import { authClient } from './authClient';
import { apiRequestRaw } from './client';

export interface AuthSessionUser {
  user_id: string;
  role: 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer';
  display_name: string;
  avatar_url?: string | null;
  session_expires_at_utc: string;
  reauth_expires_at_utc: string;
}

export interface AuthAccessHelp {
  signup_enabled: boolean;
  admin_signup_enabled: boolean;
  signup_code_required: boolean;
  signup_code_length: number;
  user_id_rules: {
    pattern: string;
    min_length: number;
    max_length: number;
    example: string;
  };
  password_rules: {
    min_length: number;
    requires_upper: boolean;
    requires_lower: boolean;
    requires_number: boolean;
  };
}

interface LoginResponse {
  access_token: string;
  token_type: 'Bearer';
  user: {
    user_id: string;
    role: AuthSessionUser['role'];
    display_name: string;
    avatar_url?: string | null;
  };
  session_expires_at_utc: string;
  reauth_expires_at_utc: string;
}

interface AuthMeResponse {
  user_id: string;
  role: AuthSessionUser['role'];
  display_name: string;
  avatar_url?: string | null;
  session_expires_at_utc: string;
  reauth_expires_at_utc: string;
}

export async function loginAuth(userId: string, password: string): Promise<AuthSessionUser> {
  const response = await apiRequestRaw<LoginResponse>({
    path: '/auth/login',
    method: 'post',
    body: {
      user_id: userId,
      password
    }
  });
  authClient.setSession({
    accessToken: response.access_token,
    user_id: response.user.user_id,
    role: response.user.role,
    display_name: response.user.display_name,
    ...(response.user.avatar_url ? { avatar_url: response.user.avatar_url } : {}),
    session_expires_at_utc: response.session_expires_at_utc,
    reauth_expires_at_utc: response.reauth_expires_at_utc
  });
  return {
    user_id: response.user.user_id,
    role: response.user.role,
    display_name: response.user.display_name,
    ...(response.user.avatar_url ? { avatar_url: response.user.avatar_url } : {}),
    session_expires_at_utc: response.session_expires_at_utc,
    reauth_expires_at_utc: response.reauth_expires_at_utc
  };
}

export async function readAuthMe(): Promise<AuthSessionUser> {
  const response = await apiRequestRaw<AuthMeResponse>({
    path: '/auth/me',
    method: 'get'
  });
  const currentToken = authClient.getAccessToken();
  if (currentToken) {
    authClient.setSession({
      accessToken: currentToken,
      user_id: response.user_id,
      role: response.role,
      display_name: response.display_name,
      ...(response.avatar_url ? { avatar_url: response.avatar_url } : {}),
      session_expires_at_utc: response.session_expires_at_utc,
      reauth_expires_at_utc: response.reauth_expires_at_utc
    });
  }
  return {
    user_id: response.user_id,
    role: response.role,
    display_name: response.display_name,
    ...(response.avatar_url ? { avatar_url: response.avatar_url } : {}),
    session_expires_at_utc: response.session_expires_at_utc,
    reauth_expires_at_utc: response.reauth_expires_at_utc
  };
}

export async function logoutAuth(): Promise<void> {
  try {
    await apiRequestRaw<{ ok: boolean }>({ path: '/auth/logout', method: 'post' });
  } finally {
    authClient.clearSession();
  }
}

export async function reauthAuth(password: string): Promise<{ reauth_expires_at_utc: string }> {
  const response = await apiRequestRaw<{ ok: boolean; reauth_expires_at_utc: string }>({
    path: '/auth/reauth',
    method: 'post',
    body: { password }
  });
  const session = authClient.getSession();
  const token = authClient.getAccessToken();
  if (session && token) {
    authClient.setSession({
      accessToken: token,
      user_id: session.user_id,
      role: session.role,
      display_name: session.display_name,
      ...(session.avatar_url ? { avatar_url: session.avatar_url } : {}),
      session_expires_at_utc: session.session_expires_at_utc ?? new Date().toISOString(),
      reauth_expires_at_utc: response.reauth_expires_at_utc
    });
  }
  return {
    reauth_expires_at_utc: response.reauth_expires_at_utc
  };
}

export async function getAuthAccessHelp(): Promise<AuthAccessHelp | null> {
  try {
    return await apiRequestRaw<AuthAccessHelp>({
      path: '/auth/access-help',
      method: 'get'
    });
  } catch {
    return null;
  }
}

export async function registerAuthUser(input: {
  user_id: string;
  display_name: string;
  role: AuthSessionUser['role'];
  password: string;
  signup_code: string;
}): Promise<{ ok: boolean; user: { user_id: string; role: AuthSessionUser['role']; display_name: string } }> {
  return apiRequestRaw<{ ok: boolean; user: { user_id: string; role: AuthSessionUser['role']; display_name: string } }>({
    path: '/auth/register',
    method: 'post',
    body: input
  });
}

export async function updateAuthProfile(input: {
  display_name?: string;
  avatar_url?: string | null;
}): Promise<{ ok: boolean; user: { user_id: string; role: AuthSessionUser['role']; display_name: string; avatar_url?: string | null } }> {
  const response = await apiRequestRaw<{ ok: boolean; user: { user_id: string; role: AuthSessionUser['role']; display_name: string; avatar_url?: string | null } }>({
    path: '/auth/profile',
    method: 'patch',
    body: input
  });
  const token = authClient.getAccessToken();
  if (token && response.ok) {
    const current = authClient.getSession();
    authClient.setSession({
      accessToken: token,
      user_id: response.user.user_id,
      role: response.user.role,
      display_name: response.user.display_name,
      ...(response.user.avatar_url ? { avatar_url: response.user.avatar_url } : {}),
      session_expires_at_utc: current?.session_expires_at_utc ?? new Date().toISOString(),
      reauth_expires_at_utc: current?.reauth_expires_at_utc ?? new Date().toISOString()
    });
  }
  return response;
}

export async function changeAuthPassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return apiRequestRaw<{ ok: boolean }>({
    path: '/auth/change-password',
    method: 'post',
    body: {
      current_password: currentPassword,
      new_password: newPassword
    }
  });
}

export async function resetForgottenPassword(input: {
  user_id: string;
  reset_code: string;
  new_password: string;
}): Promise<{ ok: boolean }> {
  return apiRequestRaw<{ ok: boolean }>({
    path: '/auth/forgot-password/reset',
    method: 'post',
    body: input
  });
}

export async function generateSignupCode(ttlMinutes = 30): Promise<{ ok: boolean; code: string; expires_at_utc: string }> {
  return apiRequestRaw<{ ok: boolean; code: string; expires_at_utc: string }>({
    path: '/auth/admin/signup-code',
    method: 'post',
    body: { ttl_minutes: ttlMinutes }
  });
}

export async function generatePasswordResetCode(userId: string, ttlMinutes = 30): Promise<{ ok: boolean; user_id: string; code: string; expires_at_utc: string }> {
  return apiRequestRaw<{ ok: boolean; user_id: string; code: string; expires_at_utc: string }>({
    path: '/auth/admin/password-reset-code',
    method: 'post',
    body: { user_id: userId, ttl_minutes: ttlMinutes }
  });
}
