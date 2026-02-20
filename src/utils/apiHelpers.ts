import { authClient } from '../api/authClient';

const CONTROL_PLANE_BASE_URL = import.meta.env.VITE_CONTROL_PLANE_URL ?? 'http://localhost:8787';

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const auth = authClient.getOperatorAuth();

  headers.set('Content-Type', 'application/json');
  headers.set('x-operator-id', auth.operatorId);
  headers.set('x-operator-role', auth.operatorRole);

  const response = await fetch(`${CONTROL_PLANE_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${response.status} ${path}: ${body}`);
  }

  return response.json() as Promise<T>;
}
