import { clientEnv } from '@/core-ui/config/clientEnv';

const API_BASE = `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1`;

/** Shape every services endpoint wraps its payload in. */
interface ApiEnvelope<T> {
  data?: T;
  message?: string;
  error?: string;
}

type ApiInit = RequestInit & {
  /**
   * Non-2xx statuses to treat as success. The parsed `data` is returned when
   * present, otherwise `null` — used for idempotent calls where e.g. a 409
   * ("already done") is an expected, non-error outcome.
   */
  okStatuses?: number[];
};

/**
 * Single choke point for talking to the services API: prefixes the base URL,
 * parses the `{ data, message }` envelope, and turns a failed response into a
 * thrown `Error` carrying the server message. Returns the unwrapped `data`
 * (or `null` when the body has none / the status is in `okStatuses`).
 */
export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T | null> {
  const { okStatuses = [], ...rest } = init;
  const response = await fetch(`${API_BASE}${path}`, rest);
  const body: ApiEnvelope<T> | null = await response.json().catch(() => null);

  if (!response.ok) {
    if (okStatuses.includes(response.status)) return null;
    throw new Error(body?.message ?? body?.error ?? `Request failed (${response.status})`);
  }

  return body?.data ?? null;
}

/** GET helper that unwraps `data`. */
export function getJson<T>(path: string, okStatuses?: number[]): Promise<T | null> {
  return apiFetch<T>(path, { okStatuses });
}

/** POST helper that JSON-encodes the body (when given) and unwraps `data`. */
export function postJson<T>(path: string, body?: unknown, okStatuses?: number[]): Promise<T | null> {
  return apiFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    okStatuses,
  });
}

/** DELETE helper that unwraps `data`. */
export function delJson<T>(path: string, okStatuses?: number[]): Promise<T | null> {
  return apiFetch<T>(path, { method: 'DELETE', okStatuses });
}
