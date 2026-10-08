import { type Prisma, prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { audited } from '@/lib/audit';

import {
  type AchievementAdminPayload,
  achievementCreateSchema,
  achievementPayloadToRow,
} from '@vaquita/shared/services/profile/rules';

import {
  achievementWriteToPrisma,
  adminRequestOk,
  fail,
  forbidden,
  invalidJson,
  serializeAchievement,
} from '@/lib/adminAchievements';

// Server-side admin API for the `achievements` catalog. Migrated from apps/api's
// /api/v1/admin/achievements so the admin app is same-origin and the admin
// secret stays server-side. Validation schemas are imported from @vaquita/shared
// rather than redeclared, so the rule/unlock-type constraints stay in one place
// and remain identical to the public catalog endpoint's expectations.
export const runtime = 'nodejs';
// The catalog is read live from the DB — never statically cached.
export const dynamic = 'force-dynamic';

// GET /api/admin/achievements — full catalog incl. disabled/hidden rows.
export async function GET(req: NextRequest) {
  if (!(await adminRequestOk(req))) return forbidden();
  const achievements = await prisma.achievement.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
  });
  return NextResponse.json({ status: 'success', data: { achievements: achievements.map(serializeAchievement) } });
}

// POST /api/admin/achievements — create a new badge. `key` is immutable once created.
async function POSTHandler(req: NextRequest) {
  if (!(await adminRequestOk(req))) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }

  const parsed = achievementCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail('Invalid achievement payload', 400, parsed.error.flatten());
  }
  const { key, ...rest } = parsed.data as AchievementAdminPayload & { key: string };

  const existing = await prisma.achievement.findFirst({ where: { key, deletedAt: null } });
  if (existing) {
    return fail(`An achievement with key "${key}" already exists.`, 409);
  }

  const achievement = await prisma.achievement.create({
    data: {
      key,
      ...achievementWriteToPrisma(achievementPayloadToRow(rest)),
    } as Prisma.AchievementUncheckedCreateInput,
  });
  return NextResponse.json({ status: 'success', data: { achievement: serializeAchievement(achievement) } });
}

export const POST = audited('achievements.create', POSTHandler);
