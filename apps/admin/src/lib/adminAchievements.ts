import { Prisma, prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';

import type { AchievementWriteFields } from '@vaquita/shared/services/profile/index';

// Server-side helpers shared by the two achievement route handlers
// (`/api/admin/achievements` and `/api/admin/achievements/[key]`). These mirror
// the behaviour of apps/api's admin router so the migration is contract-neutral:
// same auth gate, same response envelope, same snake_case row shape.

export { adminSecretOk } from './adminSecret';

export const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });

export const invalidJson = () => NextResponse.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });

export const fail = (message: string, status: number, details?: unknown) =>
  NextResponse.json({ status: 'error', message, ...(details !== undefined ? { details } : {}) }, { status });

type AchievementRow = Awaited<ReturnType<typeof prisma.achievement.findFirstOrThrow>>;

/**
 * Prisma row -> the snake_case document the admin UI consumes. Kept identical to
 * `toAchievementDoc` in @vaquita/shared so the wire format does not change.
 * `id` is a `bigint` column with no JSON representation, hence the Number cast.
 */
export const serializeAchievement = (a: AchievementRow) => ({
  id: Number(a.id),
  key: a.key,
  name: a.name,
  description: a.description,
  tier: a.tier,
  coin_reward: a.coinReward,
  xp_reward: a.xpReward,
  code: a.code,
  hidden: a.hidden,
  refresh_policy: a.refreshPolicy,
  cycle_scoped: a.cycleScoped,
  unlock_type: a.unlockType,
  rule: a.rule ?? null,
  icon: a.icon,
  accent: a.accent,
  display_order: a.displayOrder,
  enabled: a.enabled,
  created_at: a.createdAt.toISOString(),
  updated_at: a.updatedAt.toISOString(),
});

/** Map the admin panel's snake_case write fields onto Prisma's camelCase columns.
 *  Only keys present in `input` are emitted, so PATCH can send a partial. */
export const achievementWriteToPrisma = (
  input: Partial<AchievementWriteFields>
): Prisma.AchievementUncheckedUpdateInput => {
  const data: Prisma.AchievementUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.tier !== undefined) data.tier = input.tier;
  if (input.coin_reward !== undefined) data.coinReward = input.coin_reward;
  if (input.xp_reward !== undefined) data.xpReward = input.xp_reward;
  if (input.unlock_type !== undefined) data.unlockType = input.unlock_type;
  if (input.rule !== undefined)
    data.rule = input.rule === null ? Prisma.DbNull : (input.rule as unknown as Prisma.InputJsonValue);
  if (input.icon !== undefined) data.icon = input.icon;
  if (input.accent !== undefined) data.accent = input.accent;
  if (input.code !== undefined) data.code = input.code;
  if (input.hidden !== undefined) data.hidden = input.hidden;
  if (input.cycle_scoped !== undefined) data.cycleScoped = input.cycle_scoped;
  if (input.refresh_policy !== undefined) data.refreshPolicy = input.refresh_policy;
  if (input.display_order !== undefined) data.displayOrder = input.display_order;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  return data;
};
