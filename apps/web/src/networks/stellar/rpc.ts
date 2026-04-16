export async function rpcCall<T = object>(rpcUrl: string, method: string, params: object): Promise<T> {
  const body = { jsonrpc: '2.0', id: Date.now(), method, params };
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    console.error('[rpcCall] non-JSON response', { method, raw });
    throw new Error(`RPC ${method} returned non-JSON (${res.status})`);
  }
  if (json.error) {
    console.error('[rpcCall] error', json.error);
    throw new Error(json.error?.message || `RPC ${method} failed`);
  }
  return json.result as T;
}

export async function submitAndWait(
  rpcUrl: string,
  hash: string,
  opts?: { maxAttempts?: number; intervalMs?: number }
) {
  const maxAttempts = opts?.maxAttempts ?? 20;
  const intervalMs = opts?.intervalMs ?? 500;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const status = await rpcCall<{ status?: string; resultXdr?: string }>(rpcUrl, 'getTransaction', { hash });
    if (status?.status && status.status !== 'NOT_FOUND' && status.status !== 'PENDING') {
      return status;
    }
  }
  throw new Error('Timeout waiting for transaction result');
}
