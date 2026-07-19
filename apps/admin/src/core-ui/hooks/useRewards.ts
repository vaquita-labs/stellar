import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';

/**
 * Shape of a `rewards` row as returned by the admin API route. The route is
 * same-origin (Next.js Route Handler) and returns the Prisma object directly
 * (with the BigInt `id` mapped to a number), so fields are camelCase.
 */
export interface Reward {
  id: number;
  key: string | null;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload accepted by POST /api/admin/rewards (both fields optional). */
export interface RewardCreatePayload {
  key?: string | null;
  name?: string | null;
}

/** Payload accepted by PATCH /api/admin/rewards (id required, rest optional). */
export interface RewardUpdatePayload extends RewardCreatePayload {
  id: number;
}

// Same-origin route handler inside this admin app — no NEXT_PUBLIC_SERVICES_URL.
const REWARDS_URL = '/api/admin/rewards';

// The admin secret guard lives server-side in the route handler; we still echo
// the secret header so the check passes when ADMIN_SECRET is configured.
const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

/** Read the full list of (non-deleted) rewards. */
export const useRewards = () =>
  useQuery<Reward[]>({
    queryKey: ['admin', 'rewards'],
    queryFn: async () => {
      const response = await fetch(REWARDS_URL, { headers: adminHeaders() });
      const data = await response.json();
      return (data?.data?.rewards ?? []) as Reward[];
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

/** Create a reward. Throws with a readable message on failure. */
export const createReward = async (payload: RewardCreatePayload): Promise<Reward> => {
  const response = await fetch(REWARDS_URL, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to create reward'));
  const data = await response.json();
  return data?.data?.reward as Reward;
};

/** Update a reward. Only the keys present in the payload are written. */
export const updateReward = async (payload: RewardUpdatePayload): Promise<Reward> => {
  const response = await fetch(REWARDS_URL, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to update reward'));
  const data = await response.json();
  return data?.data?.reward as Reward;
};

/** Soft-delete a reward by id. */
export const deleteReward = async (id: number): Promise<void> => {
  const response = await fetch(`${REWARDS_URL}?id=${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to delete reward'));
};
