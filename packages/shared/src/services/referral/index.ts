import { resolveAvatarConfig } from '@vaquita/avatar';
import { prisma } from '@vaquita/db';
import { DepositStatus, WithdrawalStatus } from '../../types';
import { getSupportedTokenIds } from '../wallets/onchainBalances';
import type {
  ReferralSummaryResponseDTO,
  ReferrerLeaderboardResponseDTO,
  ReferrerLeaderboardRowDTO,
} from '../../types';

/**
 * Referral (invite-a-friend) service.
 *
 * Counts, and nothing else. There used to be an APY-boost tier table and a
 * total/pending earnings pair here: no rate ever applied the bonus and no
 * payout ledger was ever built, so all of it resolved to zero on every read.
 * The invite screen now says rewards are coming instead of rendering a figure
 * that was never true.
 *
 * A referral is ACTIVE when the referred user has at least one live deposit —
 * confirmed on-chain, not yet withdrawn — or a positive flexible-vault balance.
 */

/**
 * The profile's invite code, which since the vaquitag release IS its tag.
 *
 * Nothing is minted here any more. A code used to be six random characters
 * (`FW6A86`) nobody could say across a table at an event; now it is the handle
 * the user already has, written by [[setNickname]] alongside the nickname. This
 * function only repairs drift — a row the migration skipped, or a profile whose
 * tag was set before the mirror existed — and returns the tag either way.
 *
 * A profile with no tag has nothing to hand out: it keeps whatever old random
 * code it had, and returns the empty string if it never had one. Those profiles
 * predate the username gate and cannot open the invite screen at all.
 */
export const ensureReferralCode = async (profile: {
  id: number;
  nickname?: string | null;
  referralCode: string | null;
}): Promise<string> => {
  const tag = profile.nickname ?? null;
  if (!tag) return profile.referralCode ?? '';
  if (profile.referralCode === tag) return tag;

  try {
    const updated = await prisma.profile.update({
      where: { id: profile.id },
      data: { referralCode: tag },
      select: { referralCode: true },
    });
    return updated.referralCode ?? tag;
  } catch (error) {
    // P2002 = another profile (possibly soft-deleted — that index does not
    // exclude them) already owns this code. The tag is still the user's, so the
    // link is broken rather than wrong: report the old code and leave the
    // collision for a human, instead of failing the read that asked.
    console.error('Error mirroring referral code onto the tag', error);
    return profile.referralCode ?? '';
  }
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
 * Referral summary for a wallet. Upserts the viewer (so a first-time caller
 * still resolves to a row), resolves the invite code — which is the viewer's
 * vaquitag — and counts referrals, joined and saving.
 */
export const getReferralSummary = async (walletAddress: string): Promise<ReferralSummaryResponseDTO> => {
  const viewer = await prisma.profile.upsert({
    where: { walletAddress },
    update: {},
    create: { walletAddress },
    select: { id: true, nickname: true, referralCode: true },
  });

  const code = await ensureReferralCode(viewer);

  // Profiles this user referred (attribution edge), then how many are active.
  const referred = await prisma.profile.findMany({
    where: { referredById: viewer.id, deletedAt: null },
    select: { walletAddress: true },
  });
  const activeReferrals = await countActiveReferrals(referred.map((r) => r.walletAddress));

  return {
    walletAddress,
    code,
    referrals: referred.length,
    activeReferrals,
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
  // Lowercased, because the code is a vaquitag and tags are stored lowercase.
  // The lookup is insensitive anyway — old random codes were uppercase and
  // those links still work — so this only decides what gets logged.
  const code = rawCode.trim().toLowerCase();
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

  // `findFirst`, not `findUnique`: the column is unique but Prisma cannot ask
  // for an insensitive match on a unique lookup, and the two eras of codes are
  // stored in different cases.
  const referrer = await prisma.profile.findFirst({
    where: { referralCode: { equals: code, mode: 'insensitive' } },
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
