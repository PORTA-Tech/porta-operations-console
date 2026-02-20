import { authClient } from './authClient';
import type { paths } from './generated/controlPlane';

export type ApiError = {
  code: string;
  message: string;
  status: number;
  correlation_id?: string;
};

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type PathKey = keyof paths;

type ExistingMethod<P extends PathKey> = {
  [M in HttpMethod]: paths[P][M] extends never ? never : M;
}[HttpMethod];

type Operation<P extends PathKey, M extends ExistingMethod<P>> = Exclude<paths[P][M], never>;

type RequestJsonBody<Op> = Op extends { requestBody: { content: { 'application/json': infer B } } } ? B : never;

type ResponseMap<Op> = Op extends { responses: infer R } ? R : never;

type SuccessStatus = 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226;

type SuccessJsonBody<Op> = {
  [S in keyof ResponseMap<Op>]: S extends SuccessStatus
    ? ResponseMap<Op>[S] extends { content: { 'application/json': infer B } }
      ? B
      : void
    : never;
}[keyof ResponseMap<Op>];

export type ApiResponse<P extends PathKey, M extends ExistingMethod<P>> = SuccessJsonBody<Operation<P, M>>;

export type ApiRequestInput<P extends PathKey, M extends ExistingMethod<P>> = {
  path: P;
  method: M;
  body?: RequestJsonBody<Operation<P, M>>;
  signal?: AbortSignal;
};

const DEV_API_BASE_URL = 'http://localhost:8787';

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured && configured.trim().length > 0) {
    return configured.replace(/\/$/, '');
  }

  if (import.meta.env.DEV) {
    return DEV_API_BASE_URL;
  }

  throw new Error('Missing VITE_API_BASE_URL in production mode');
}

function normalizeApiError(status: number, payload: unknown, correlationId: string | null): ApiError {
  const fallback = typeof payload === 'string' ? payload : undefined;
  const message =
    (typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : undefined) ??
    (typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : undefined) ??
    fallback ??
    'Request failed';

  const code =
    status === 400
      ? 'validation_error'
      : status === 409
        ? 'rollout_conflict'
        : status === 412
          ? 'monotonic_violation'
          : status >= 500
            ? 'system_error'
            : 'request_error';

  return {
    code,
    message,
    status,
    correlation_id: correlationId ?? undefined
  };
}

export async function apiRequest<P extends PathKey, M extends ExistingMethod<P>>(
  input: ApiRequestInput<P, M>
): Promise<ApiResponse<P, M>> {
  const auth = authClient.getOperatorAuth();
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('x-operator-id', auth.operatorId);
  headers.set('x-operator-role', auth.operatorRole);

  const response = await fetch(`${resolveApiBaseUrl()}${String(input.path)}`, {
    method: input.method.toUpperCase(),
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.signal
  });

  const correlationId = response.headers.get('x-correlation-id');
  const text = await response.text();
  const payload: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw normalizeApiError(response.status, payload, correlationId);
  }

  return payload as ApiResponse<P, M>;
}
