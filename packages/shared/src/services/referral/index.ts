import { resolveAvatarConfig } from '@vaquita/avatar';
import { prisma } from '@vaquita/db';
import { DepositStatus, WithdrawalStatus } from '../../types';
import { getSupportedTokenIds } from '../wallets/onchainBalances';
import type {
  ReferralSummaryResponseDTO,
  ReferralTierDTO,
  ReferrerLeaderboardResponseDTO,
  ReferrerLeaderboardRowDTO,
} from '../../types';

/**
 * Referral (invite-a-friend) service.
 *
 * The APY boost is not stored — it is derived at read time from how many of a
 * user's referred profiles are currently "active". A referral is active when the
 * referred user has at least one live deposit (confirmed on-chain, not yet
 * withdrawn), mirroring the DEPOSIT_SUCCESS state the deposit service computes.
 * The more active referrals, the higher the tier, and the tier's bonus is added
 * on top of the base APY in the client.
 *
 * Earnings (`total`/`pending`) are honest zeros for now: there is no referral
 * payout ledger yet. They are surfaced as real fields so the payout engine can
 * fill them in without a DTO change.
 */

/** Boost tiers: reach `referrals` active referrals → add `bonus` APY points. */
export const REFERRAL_TIERS: ReferralTierDTO[] = [
  { referrals: 1, bonus: 0.25 },
  { referrals: 3, bonus: 0.5 },
  { referrals: 5, bonus: 1 },
  { referrals: 10, bonus: 2 },
];

/** Highest tier bonus reached for a given active-referral count. */
export const getReferralBonus = (activeReferrals: number): number =>
  REFERRAL_TIERS.reduce((bonus, tier) => (activeReferrals >= tier.referrals ? tier.bonus : bonus), 0);

/** Next tier still to reach, or null when already at the top. */
export const getNextReferralTier = (activeReferrals: number): ReferralTierDTO | null =>
  REFERRAL_TIERS.find((tier) => activeReferrals < tier.referrals) ?? null;

// Unambiguous alphabet (no 0/O, 1/I) so a spoken/typed code is hard to mistype.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const randomCode = (): string => {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
};

/**
 * Returns the profile's referral code, minting one on first use. Retries on the
 * (tiny) chance of a unique-index collision. Concurrent first-reads can race; if
 * the update loses to another writer we re-read the now-present code.
 */
export const ensureReferralCode = async (profile: { id: number; referralCode: string | null }): Promise<string> => {
  if (profile.referralCode) return profile.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const updated = await prisma.profile.update({
        where: { id: profile.id },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode!;
    } catch (err) {
      // P2002 = unique violation. Either the code collided (retry with a new one)
      // or a concurrent request already assigned this profile a code (re-read).
      const existing = await prisma.profile.findUnique({
        where: { id: profile.id },
        select: { referralCode: true },
      });
      if (existing?.referralCode) return existing.referralCode;
      if (attempt === 4) throw err;
    }
  }
  // Unreachable: the loop either returns or throws on the last attempt.
  throw new Error('Could not allocate a referral code');
};

/**
 * Which of these wallets are currently saving, in either product.
 *
 * Returns the set rather than a count because the leaderboard needs the answer
 * for every referrer at once: two queries over every referred wallet, then an
 * intersection per referrer, instead of two queries per row.
 */
const findSavingWallets = async (referredWallets: string[]): Promise<Set<string>> => {
  if (referredWallets.length === 0) return new Set();

  // Two products, one question. A wallet counts once if it holds money in
  // either: a locked deposit confirmed on-chain with no confirmed withdrawal
  // (the shape the deposit service maps to DEPOSIT_SUCCESS), or a positive
  // flexible-vault balance. Counting locked alone would read a vault-only saver
  // as not saving, and the vault is the path the deposit sheet offers first to
  // non-web3 users — exactly who an invite brings in.
  //
  // `wallet_balances` is a snapshot, refreshed lazily when a wallet interacts
  // with the app, so this trails reality by up to the refresh age. Acceptable
  // for a headline count on the invite screen; do not build a payout on it.
  const tokenIds = await getSupportedTokenIds();

  const [locked, vault] = await Promise.all([
    prisma.deposit.groupBy({
      by: ['walletAddress'],
      where: {
        walletAddress: { in: referredWallets },
        deletedAt: null,
        status: DepositStatus.CONFIRMED,
        transactionHash: { not: null },
        depositIdHex: { not: null },
        withdrawals: {
          none: { status: WithdrawalStatus.CONFIRMED },
        },
      },
      _count: { _all: true },
    }),
    // Scoped to the supported tokens on purpose: production still carries rows
    // for a retired token on the same vault, so an unscoped read double-counts.
    tokenIds.length === 0
      ? Promise.resolve([] as { walletAddress: string }[])
      : prisma.walletBalance.findMany({
          where: {
            walletAddress: { in: referredWallets },
            tokenId: { in: tokenIds },
            vaultUsdc: { gt: 0 },
          },
          select: { walletAddress: true },
          distinct: ['walletAddress'],
        }),
  ]);

  const saving = new Set(locked.map((row) => row.walletAddress));
  for (const row of vault) saving.add(row.walletAddress);
  return saving;
};

/** How many of these referred profiles are currently saving, in either product. */
const countActiveReferrals = async (referredWallets: string[]): Promise<number> =>
  (await findSavingWallets(referredWallets)).size;

/**
 * Full referral summary for a wallet. Upserts the viewer (so a first-time caller
 * still resolves to a row), mints a code if needed, then counts active referrals
 * and derives the APY bonus / next tier from them.
 */
export const getReferralSummary = async (walletAddress: string): Promise<ReferralSummaryResponseDTO> => {
  const viewer = await prisma.profile.upsert({
    where: { walletAddress },
    update: {},
    create: { walletAddress },
    select: { id: true, referralCode: true },
  });

  const code = await ensureReferralCode(viewer);

  // Profiles this user referred (attribution edge), then how many are active.
  const referred = await prisma.profile.findMany({
    where: { referredById: viewer.id, deletedAt: null },
    select: { walletAddress: true },
  });
  const activeReferrals = await countActiveReferrals(referred.map((r) => r.walletAddress));

  const apyBonus = getReferralBonus(activeReferrals);
  const nextTier = getNextReferralTier(activeReferrals);

  return {
    walletAddress,
    code,
    referrals: referred.length,
    activeReferrals,
    apyBonus,
    // No payout ledger yet — surfaced as real fields, filled by the payout engine.
    totalEarnings: 0,
    pendingEarnings: 0,
    nextTier,
    tiers: REFERRAL_TIERS,
  };
};

export type RedeemReferralResult =
  | { success: true; referrerWallet: string }
  | { success: false; errorMessage: string };

/**
 * Attributes `walletAddress` to the owner of `code` (one-time, at signup).
 * Idempotent-ish: a profile can only ever be attributed once. Guards against
 * redeeming an unknown code, one's own code, or creating a referral cycle.
 */
export const redeemReferralCode = async (
  walletAddress: string,
  rawCode: string,
): Promise<RedeemReferralResult> => {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { success: false, errorMessage: 'A referral code is required.' };

  const viewer = await prisma.profile.upsert({
    where: { walletAddress },
    update: {},
    create: { walletAddress },
    select: { id: true, referredById: true },
  });

  if (viewer.referredById) {
    return { success: false, errorMessage: 'This account already used a referral code.' };
  }

  const referrer = await prisma.profile.findUnique({
    where: { referralCode: code },
    select: { id: true, walletAddress: true, deletedAt: true },
  });

  if (!referrer || referrer.deletedAt) {
    return { success: false, errorMessage: 'That referral code is not valid.' };
  }
  if (referrer.id === viewer.id) {
    return { success: false, errorMessage: 'You cannot use your own referral code.' };
  }

  await prisma.profile.update({
    where: { id: viewer.id },
    data: { referredById: referrer.id },
  });

  return { success: true, referrerWallet: referrer.walletAddress };
};

// ---------------------------------------------------------------------------
// Referrer leaderboard
// ---------------------------------------------------------------------------

/** How many rows the board shows. The viewer's own row is pinned beneath it. */
export const REFERRER_BOARD_SIZE = 30;

/**
 * How long a computed board stays fresh. It is identical for every viewer — the
 * only per-viewer part is which row is theirs — so one computation serves every
 * request in the window. Mirrors the enriched leaderboard's cache, for the same
 * reason: the build is several table scans and the numbers move in days.
 */
const REFERRER_BOARD_TTL_MS = 30_000;

/** The whole ranking, viewer-independent. `isCurrentUser` is filled in per request. */
type RankedReferrer = Omit<ReferrerLeaderboardRowDTO, 'isCurrentUser'>;

/**
 * Rank every referrer by friends joined, with friends saving beside it.
 *
 * Joined is the ranking key on purpose: "saving" partly reads the lazily
 * refreshed `wallet_balances` snapshot, so ranking on it would move people up
 * and down for reasons they did not cause.
 *
 * Three shapes worth noting:
 *
 * - **One query for the edges, one for the referrers.** The attribution rows
 *   carry both the count and the wallets each referrer brought, so grouping them
 *   in memory costs nothing and saves a `groupBy` plus a second read.
 * - **Nickname-less profiles are dropped before positions are assigned**, the
 *   same rule as `enrichLeaderboardRows`. Filtering afterwards leaves holes in
 *   the ranks and the board reads as broken. It also means a referrer who never
 *   picked a nickname has no public row — there is no name to show.
 * - **Saving is resolved once for every referred wallet on the board**, then
 *   intersected per referrer. `findSavingWallets` is the single definition of
 *   saving that the invite screen already uses; calling it per referrer would be
 *   two queries per row.
 */
const buildReferrerBoard = async (): Promise<RankedReferrer[]> => {
  const edges = await prisma.profile.findMany({
    where: { referredById: { not: null }, deletedAt: null },
    select: { walletAddress: true, referredById: true },
  });
  if (edges.length === 0) return [];

  const referredByReferrer = new Map<number, string[]>();
  for (const edge of edges) {
    const referrerId = edge.referredById!;
    const wallets = referredByReferrer.get(referrerId);
    if (wallets) wallets.push(edge.walletAddress);
    else referredByReferrer.set(referrerId, [edge.walletAddress]);
  }

  const referrers = await prisma.profile.findMany({
    where: { id: { in: [...referredByReferrer.keys()] }, deletedAt: null },
    select: { id: true, walletAddress: true, nickname: true, avatarConfig: true },
  });

  const ranked = referrers.filter((referrer) => !!referrer.nickname?.trim());
  const savingWallets = await findSavingWallets(ranked.flatMap((r) => referredByReferrer.get(r.id) ?? []));

  return ranked
    .map((referrer) => {
      const referred = referredByReferrer.get(referrer.id) ?? [];
      return {
        walletAddress: referrer.walletAddress,
        nickname: referrer.nickname!.trim(),
        avatarConfig: resolveAvatarConfig(referrer.avatarConfig, referrer.walletAddress),
        referrals: referred.length,
        activeReferrals: referred.filter((wallet) => savingWallets.has(wallet)).length,
      };
    })
    // Saving breaks a tie on joined, and the nickname breaks a tie on both, so
    // two referrers with identical counts keep a stable order between requests.
    .sort(
      (a, b) =>
        b.referrals - a.referrals ||
        b.activeReferrals - a.activeReferrals ||
        a.nickname.localeCompare(b.nickname),
    )
    .map((row, index) => ({ position: index + 1, ...row }));
};

let boardCache: { at: number; promise: Promise<RankedReferrer[]> } | null = null;

/**
 * Cached accessor for the ranking. Caches the promise, not the value, so
 * concurrent requests during a rebuild share one in-flight computation instead
 * of stampeding the database; a failed build evicts itself so the next request
 * retries.
 */
const getRankedReferrers = async (ttlMs: number = REFERRER_BOARD_TTL_MS): Promise<RankedReferrer[]> => {
  const now = Date.now();
  if (boardCache && now - boardCache.at < ttlMs) return boardCache.promise;

  const promise = buildReferrerBoard();
  promise.catch(() => {
    if (boardCache?.promise === promise) boardCache = null;
  });
  boardCache = { at: now, promise };
  return promise;
};

/** Test hook: drop the cached ranking. */
export const clearReferrerBoardCache = (): void => {
  boardCache = null;
};

/**
 * The referrer board as one viewer sees it: the top slice, plus their own row
 * whether or not it is in that slice. A viewer who referred nobody, or who has
 * no nickname, gets `me: null` — the screen says so rather than inventing a row.
 */
export const getReferrerLeaderboard = async (
  viewerWallet: string,
): Promise<ReferrerLeaderboardResponseDTO> => {
  const ranked = await getRankedReferrers();
  const isViewer = (row: RankedReferrer) => row.walletAddress.toLowerCase() === viewerWallet.toLowerCase();
  const withViewer = (row: RankedReferrer): ReferrerLeaderboardRowDTO => ({ ...row, isCurrentUser: isViewer(row) });

  const own = ranked.find(isViewer);
  return {
    rows: ranked.slice(0, REFERRER_BOARD_SIZE).map(withViewer),
    me: own ? withViewer(own) : null,
    total: ranked.length,
  };
};
