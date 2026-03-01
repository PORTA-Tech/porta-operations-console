import { authClient } from './authClient';
import { apiRequestRaw } from './client';

export interface AuthSessionUser {
  user_id: string;
  role: 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer';
  display_name: string;
  session_expires_at_utc: string;
  reauth_expires_at_utc: string;
}

export interface AuthAccessHelp {
  signup_enabled: boolean;
  admin_signup_enabled: boolean;
  users: Array<{
    user_id: string;
    role: AuthSessionUser['role'];
    display_name: string;
  }>;
  default_credentials: Array<{
    user_id: string;
    role: AuthSessionUser['role'];
    password: string;
  }>;
}

interface LoginResponse {
  access_token: string;
  token_type: 'Bearer';
  user: {
    user_id: string;
    role: AuthSessionUser['role'];
    display_name: string;
  };
  session_expires_at_utc: string;
  reauth_expires_at_utc: string;
}

interface AuthMeResponse {
  user_id: string;
  role: AuthSessionUser['role'];
  display_name: string;
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
    session_expires_at_utc: response.session_expires_at_utc,
    reauth_expires_at_utc: response.reauth_expires_at_utc
  });
  return {
    user_id: response.user.user_id,
    role: response.user.role,
    display_name: response.user.display_name,
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
      session_expires_at_utc: response.session_expires_at_utc,
      reauth_expires_at_utc: response.reauth_expires_at_utc
    });
  }
  return {
    user_id: response.user_id,
    role: response.role,
    display_name: response.display_name,
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
}): Promise<{ ok: boolean; user: { user_id: string; role: AuthSessionUser['role']; display_name: string } }> {
  return apiRequestRaw<{ ok: boolean; user: { user_id: string; role: AuthSessionUser['role']; display_name: string } }>({
    path: '/auth/register',
    method: 'post',
    body: input
  });
}
