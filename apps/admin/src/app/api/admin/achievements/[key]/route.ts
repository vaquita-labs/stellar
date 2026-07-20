import { prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';

import {
  type AchievementAdminPayload,
  achievementPayloadToRow,
  achievementUpdateSchema,
} from '@vaquita/shared/services/profile/rules';

import {
  achievementWriteToPrisma,
  adminSecretOk,
  fail,
  forbidden,
  invalidJson,
  serializeAchievement,
} from '@/lib/adminAchievements';

// PATCH /api/admin/achievements/[key] — edit metadata / rule / order / visibility.
// Migrated from apps/api's PATCH /api/v1/admin/achievements/:key; the `key` is
// never writable, so it stays in the path rather than the body.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!adminSecretOk(req)) return forbidden();
  const { key } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }

  const parsed = achievementUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return fail('Invalid achievement payload', 400, parsed.error.flatten());
  }

  const existing = await prisma.achievement.findFirst({ where: { key, deletedAt: null } });
  if (!existing) {
    return fail(`Unknown achievement: ${key}`, 404);
  }

  // Guard: `tier` doubles as the Soroban contract symbol used when minting a
  // badge on-chain. Silently changing it on an existing badge can break the
  // mint flow, so require an explicit override.
  const payload = parsed.data as AchievementAdminPayload;
  const wantsTierChange = payload.tier !== undefined && payload.tier !== existing.tier;
  const allowTierChange = (body as { allowTierChange?: unknown })?.allowTierChange === true;
  if (wantsTierChange && !allowTierChange) {
    return fail(
      "Changing 'tier' can break on-chain badge minting (tier is the Soroban contract symbol). Resend with allowTierChange:true to override.",
      409
    );
  }

  const achievement = await prisma.achievement.update({
    where: { key },
    data: achievementWriteToPrisma(achievementPayloadToRow(payload)),
  });
  return NextResponse.json({ status: 'success', data: { achievement: serializeAchievement(achievement) } });
}
