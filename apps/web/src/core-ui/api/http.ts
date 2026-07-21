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
  /**
   * Aborta la petición pasados N ms. `fetch` no tiene timeout propio: sin esto
   * una request que queda colgada (API reiniciándose, red muerta) nunca
   * resuelve ni rechaza, y quien la espera se queda esperando para siempre.
   * Opt-in a propósito: las llamadas on-chain pueden tardar mucho y no deben
   * cortarse. Úsalo en las que gatean el render.
   */
  timeoutMs?: number;
};

/**
 * Single choke point for talking to the services API: prefixes the base URL,
 * parses the `{ data, message }` envelope, and turns a failed response into a
 * thrown `Error` carrying the server message. Returns the unwrapped `data`
 * (or `null` when the body has none / the status is in `okStatuses`).
 */
export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T | null> {
  const { okStatuses = [], timeoutMs, ...rest } = init;

  // Sin `timeoutMs` se conserva el comportamiento anterior (sin límite). Con él
  // se aborta la request y el `await` rechaza, para que quien la espera pueda
  // reintentar o seguir con un fallback en vez de colgarse.
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      ...(controller ? { signal: rest.signal ?? controller.signal } : {}),
    });
    const body: ApiEnvelope<T> | null = await response.json().catch(() => null);

    if (!response.ok) {
      if (okStatuses.includes(response.status)) return null;
      throw new Error(body?.message ?? body?.error ?? `Request failed (${response.status})`);
    }

    return body?.data ?? null;
  } finally {
    if (timer) clearTimeout(timer);
  }
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
