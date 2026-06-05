import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';

/**
 * Shape of a `tokens` row as returned by the admin API route. The route is
 * same-origin (Next.js Route Handler) and returns the Prisma object directly,
 * so fields are camelCase.
 */
export interface Token {
  id: number;
  name: string;
  symbol: string;
  decimals: number | null;
  isNative: boolean;
  isGas: boolean;
  isSupported: boolean;
  contractAddress: string | null;
  vaquitaContractAddress: string | null;
  lockPeriods: number[];
  defindexVaultContractAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload accepted by POST /api/admin/tokens (name + symbol required). */
export interface TokenCreatePayload {
  name: string;
  symbol: string;
  decimals?: number | null;
  isNative?: boolean;
  isGas?: boolean;
  isSupported?: boolean;
  contractAddress?: string | null;
  vaquitaContractAddress?: string | null;
  lockPeriods?: number[];
  defindexVaultContractAddress?: string | null;
}

/** Payload accepted by PATCH /api/admin/tokens (id required, rest optional). */
export interface TokenUpdatePayload extends Partial<TokenCreatePayload> {
  id: number;
}

// Same-origin route handler inside this admin app — no NEXT_PUBLIC_SERVICES_URL.
const TOKENS_URL = '/api/admin/tokens';

// The admin secret guard lives server-side in the route handler; we still echo
// the secret header so the check passes when ADMIN_SECRET is configured.
const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

/** Read the full list of (non-deleted) tokens. */
export const useTokens = () =>
  useQuery<Token[]>({
    queryKey: ['admin', 'tokens'],
    queryFn: async () => {
      const response = await fetch(TOKENS_URL, { headers: adminHeaders() });
      const data = await response.json();
      return (data?.data?.tokens ?? []) as Token[];
    },
  });

const parseError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body = await response.json();
    if (typeof body?.message === 'string') return body.message;
  } catch {
    /* ignore */
  }
  return fallback;
};

/** Create a token. Throws with a readable message on failure. */
export const createToken = async (payload: TokenCreatePayload): Promise<Token> => {
  const response = await fetch(TOKENS_URL, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to create token'));
  const data = await response.json();
  return data?.data?.token as Token;
};

/** Update a token. Only the keys present in the payload are written. */
export const updateToken = async (payload: TokenUpdatePayload): Promise<Token> => {
  const response = await fetch(TOKENS_URL, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to update token'));
  const data = await response.json();
  return data?.data?.token as Token;
};

/** Soft-delete a token by id. */
export const deleteToken = async (id: number): Promise<void> => {
  const response = await fetch(`${TOKENS_URL}?id=${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to delete token'));
};
