import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';

export type BadgeUnlockType = 'rule' | 'redeem_code' | 'manual' | 'cycle_rank';
export type BadgeRuleOp = '>=' | '>' | '<=' | '<' | '==' | 'before' | 'after';

export interface BadgeRuleCondition {
  signal: string;
  op: BadgeRuleOp;
  value: number | string;
}

export interface BadgeRule {
  all: BadgeRuleCondition[];
}

/** Row shape returned by GET /admin/achievements (snake_case from the DB). */
export interface AdminAchievement {
  id: number;
  key: string;
  name: string;
  description: string;
  tier: string;
  coin_reward: number;
  unlock_type: BadgeUnlockType;
  rule: BadgeRule | null;
  icon: string | null;
  accent: string | null;
  code: string | null;
  hidden: boolean;
  enabled: boolean;
  display_order: number;
  cycle_scoped: boolean;
  refresh_policy: 'auto' | 'manual';
}

/** camelCase payload accepted by POST/PATCH /admin/achievements. */
export interface AchievementPayload {
  name?: string;
  description?: string;
  tier?: string;
  coinReward?: number;
  unlockType?: BadgeUnlockType;
  rule?: BadgeRule | null;
  icon?: string | null;
  accent?: string | null;
  code?: string | null;
  hidden?: boolean;
  enabled?: boolean;
  displayOrder?: number;
  /** Explicit override to allow changing `tier` on an existing badge — the API
   *  blocks it otherwise because tier is the Soroban mint symbol. */
  allowTierChange?: boolean;
}

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET
    ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET }
    : {}),
});

const ACHIEVEMENTS_URL = `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/admin/achievements`;

/** List the full catalog (incl. disabled/hidden), admin view. */
export const useAdminAchievements = () =>
  useQuery<AdminAchievement[]>({
    queryKey: ['admin', 'achievements'],
    queryFn: async () => {
      const response = await fetch(ACHIEVEMENTS_URL, { headers: adminHeaders() });
      const data = await response.json();
      return (data?.data?.achievements ?? []) as AdminAchievement[];
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

/** Create a new badge. Throws with a readable message on failure. */
export const createAchievement = async (
  payload: AchievementPayload & { key: string },
): Promise<AdminAchievement> => {
  const response = await fetch(ACHIEVEMENTS_URL, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to create badge'));
  const data = await response.json();
  return data?.data?.achievement as AdminAchievement;
};

/** Patch an existing badge by key. Throws with a readable message on failure. */
export const updateAchievement = async (
  key: string,
  payload: AchievementPayload,
): Promise<AdminAchievement> => {
  const response = await fetch(`${ACHIEVEMENTS_URL}/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to update badge'));
  const data = await response.json();
  return data?.data?.achievement as AdminAchievement;
};
