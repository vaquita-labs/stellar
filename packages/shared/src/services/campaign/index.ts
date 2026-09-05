import { prisma } from '@vaquita/db';
import type { Campaign } from '@vaquita/db';
import { redeemReferralCode } from '../referral';

/**
 * Campaign attribution: where a user came from, recorded once, at first touch.
 *
 * The referral half of this already existed on paper — codes were minted, a
 * redeem endpoint was written, tier bonuses were computed — but nothing ever
 * populated `profiles.referredById`, because no client read `?ref=` from the
 * URL. This service is the missing half, generalized: the landing code can be
 * either a campaign code or a user's own referral code, and either way the raw
 * UTM parameters are kept.
 *
 * FIRST TOUCH WINS. Neither `campaignId` nor `attribution` is ever overwritten,
 * the same rule `referredById` already follows. A user who arrives through a
 * paid ad, leaves, and comes back organically a week later is still that ad's
 * conversion.
 */

/** Max characters kept per captured field — these are attacker-supplied. */
const UTM_MAX = 200;
const REFERRER_MAX = 500;

export const CAMPAIGN_CODE_MAX = 32;

/**
 * Campaign codes are uppercased and restricted to the characters that survive a
 * URL, a printed flyer and a spoken hand-off. Enforced on create so marketing
 * cannot mint something that only works in one of those places.
 */
export const CAMPAIGN_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

/** The raw first-touch blob stored on `profiles.attribution`. */
export interface AttributionBlob {
  code?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  landedAt?: string;
}

/** What the client is allowed to send. Everything is optional and untrusted. */
export interface AttributionInput {
  code?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  utmContent?: unknown;
  utmTerm?: unknown;
  referrer?: unknown;
  landedAt?: unknown;
}

const clean = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
};

/**
 * Narrows an untrusted body to the fields we store. Unknown keys are dropped
 * rather than passed through: `attribution` is a jsonb column, and a jsonb
 * column that accepts arbitrary client keys is an unbounded write primitive.
 */
export const sanitizeAttribution = (input: AttributionInput): AttributionBlob => {
  const blob: AttributionBlob = {};
  const code = clean(input.code, CAMPAIGN_CODE_MAX);
  if (code) blob.code = code.toUpperCase();

  const utm: [keyof AttributionBlob, unknown][] = [
    ['utmSource', input.utmSource],
    ['utmMedium', input.utmMedium],
    ['utmCampaign', input.utmCampaign],
    ['utmContent', input.utmContent],
    ['utmTerm', input.utmTerm],
  ];
  for (const [key, raw] of utm) {
    const value = clean(raw, UTM_MAX);
    if (value) blob[key] = value;
  }

  const referrer = clean(input.referrer, REFERRER_MAX);
  if (referrer) blob.referrer = referrer;

  // The client's clock is not trusted for ordering, but it does say how long the
  // blob sat in localStorage before the user signed up. Kept only if parseable.
  const landedAt = clean(input.landedAt, 40);
  if (landedAt && !Number.isNaN(Date.parse(landedAt))) blob.landedAt = landedAt;

  return blob;
};

/** Is there anything worth writing? An all-empty blob is a no-op, not a row. */
export const isEmptyAttribution = (blob: AttributionBlob): boolean => Object.keys(blob).length === 0;

export type ResolveAttributionResult = {
  /** False when the profile was already attributed — the call was a no-op. */
  applied: boolean;
  campaignCode?: string;
  /** Set when the code turned out to be another user's referral code. */
  referrerWallet?: string;
};

/**
 * Records first-touch attribution for `walletAddress`.
 *
 * Resolution order for `code`: campaign first, user referral second. A campaign
 * code and a referral code are structurally different (`campaignId` vs
 * `referredById`), so they cannot both apply, and the admin create path refuses
 * a campaign code that collides with a live referral code.
 *
 * The referral branch delegates to `redeemReferralCode` rather than writing
 * `referredById` here: that function owns the self-referral, already-attributed
 * and unknown-code guards, and duplicating them is how they drift apart.
 *
 * Idempotent. Calling it twice for the same profile does nothing the second
 * time, which is what makes it safe to fire from a client that may retry.
 */
export const resolveAttribution = async (
  walletAddress: string,
  input: AttributionInput
): Promise<ResolveAttributionResult> => {
  const blob = sanitizeAttribution(input);
  if (isEmptyAttribution(blob)) return { applied: false };

  const profile = await prisma.profile.upsert({
    where: { walletAddress },
    update: {},
    create: { walletAddress },
    select: { id: true, campaignId: true, attribution: true, referredById: true },
  });

  // Already attributed: first touch stands. Note this checks all three columns —
  // a user who redeemed a referral code by hand is attributed too.
  if (profile.campaignId || profile.attribution || profile.referredById) {
    return { applied: false };
  }

  const result: ResolveAttributionResult = { applied: true };
  let campaignId: number | null = null;

  if (blob.code) {
    const campaign = await prisma.campaign.findFirst({
      where: { code: blob.code, deletedAt: null, isActive: true },
      select: { id: true, code: true },
    });

    if (campaign) {
      campaignId = campaign.id;
      result.campaignCode = campaign.code;
    } else {
      // Not a campaign — try it as a user referral code. A failure here is not
      // an error for the caller: the UTM blob is still worth storing, and the
      // user did nothing wrong by following a link with a stale code in it.
      const redeemed = await redeemReferralCode(walletAddress, blob.code);
      if (redeemed.success) result.referrerWallet = redeemed.referrerWallet;
    }
  }

  await prisma.profile.update({
    where: { id: profile.id },
    data: {
      ...(campaignId ? { campaignId } : {}),
      // `as object` is the shape Prisma wants for a jsonb write — same cast
      // the legal service uses for `acceptedDocuments`.
      attribution: blob as object,
    },
  });

  return result;
};

/** Admin list. Soft-deleted campaigns are never returned. */
export const listCampaigns = async (): Promise<Campaign[]> =>
  prisma.campaign.findMany({ where: { deletedAt: null }, orderBy: { id: 'desc' } });

/**
 * True when `code` is already taken — by a live campaign or by a user's
 * referral code. The second half is the one that matters: the two namespaces
 * share a resolution path, so a collision would silently redirect someone's
 * personal invites into a campaign bucket.
 */
export const isCampaignCodeTaken = async (code: string, excludeId?: number): Promise<boolean> => {
  const [campaign, profile] = await Promise.all([
    prisma.campaign.findFirst({
      where: { code, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    }),
    prisma.profile.findUnique({ where: { referralCode: code }, select: { id: true } }),
  ]);
  return Boolean(campaign || profile);
};

export interface CampaignWritePayload {
  code: string;
  name: string;
  source?: string | null;
  medium?: string | null;
  content?: string | null;
  landingPath?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
  notes?: string | null;
}

export const createCampaign = async (payload: CampaignWritePayload): Promise<Campaign> =>
  prisma.campaign.create({
    data: {
      code: payload.code.toUpperCase(),
      name: payload.name,
      source: payload.source ?? null,
      medium: payload.medium ?? null,
      content: payload.content ?? null,
      landingPath: payload.landingPath ?? null,
      startsAt: payload.startsAt ?? null,
      endsAt: payload.endsAt ?? null,
      isActive: payload.isActive ?? true,
      notes: payload.notes ?? null,
    },
  });

/** Partial update — only the keys actually present are written. */
export const updateCampaign = async (
  id: number,
  payload: Partial<CampaignWritePayload>
): Promise<Campaign | null> => {
  const existing = await prisma.campaign.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!existing) return null;

  return prisma.campaign.update({
    where: { id },
    data: {
      ...(payload.code !== undefined ? { code: payload.code.toUpperCase() } : {}),
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.source !== undefined ? { source: payload.source } : {}),
      ...(payload.medium !== undefined ? { medium: payload.medium } : {}),
      ...(payload.content !== undefined ? { content: payload.content } : {}),
      ...(payload.landingPath !== undefined ? { landingPath: payload.landingPath } : {}),
      ...(payload.startsAt !== undefined ? { startsAt: payload.startsAt } : {}),
      ...(payload.endsAt !== undefined ? { endsAt: payload.endsAt } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    },
  });
};

/**
 * Soft delete. Profiles already attributed to the campaign keep pointing at it
 * (the row stays), so retiring a campaign never rewrites history — it only
 * stops new attributions and frees the code.
 */
export const deleteCampaign = async (id: number): Promise<boolean> => {
  const { count } = await prisma.campaign.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  });
  return count > 0;
};
