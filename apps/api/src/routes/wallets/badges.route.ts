import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import {
  Achievement,
  broadcastProfileChange,
  claimAchievement,
  computeEligibilitySignals,
  confirmBadgeClaim,
  contractHasClaimed,
  getAchievementByKey,
  getActiveBadgeClaim,
  getBadgeSigningKeypair,
  getBadgesContractAddress,
  getLastClosedCycleId,
  getLeaderboardRankForWallet,
  getMintedBadges,
  getNetworkName,
  getProfile,
  isAchievementEligible,
  makeClaimExpiry,
  prisma,
  redeemAchievementCode,
  sendError,
  sendSuccess,
  signBadgeClaim,
  storeBadgeClaim,
  supersedeBadgeClaim,
  toClaimPayload,
  toProfileAchievementsResponseDTO,
} from '@vaquita/shared';

// All routes are mounted under `/wallets/:wallet/badges`, so `:wallet` is a
// parent-route param — mergeParams lets this sub-router read it.
const router = Router({ mergeParams: true });

const asyncHandler = <P = any, ResBody = any, ReqBody = any, ReqQuery = any>(
  fn: (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };

// ---------------------------------------------------------------------------
// GET /api/v1/wallets/:wallet/badges
// ---------------------------------------------------------------------------

/**
 * Lists every badge with this wallet's status (locked / unlocked / claimed) plus
 * coin reward and claim timestamp. The off-chain catalog + eligibility view.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { wallet } = req.params as { wallet: string };
    req.log.info({ wallet }, 'GET /wallets/:wallet/badges');

    const { success, errors, errorMessage, profileData } = await getProfile(wallet);

    if (!success || !profileData) {
      req.log.error({ errors, errorMessage, wallet }, 'Profile not resolved');
      return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
    }

    return sendSuccess(res, await toProfileAchievementsResponseDTO(await getNetworkName(), profileData));
  }),
);

// ---------------------------------------------------------------------------
// GET /api/v1/wallets/:wallet/badges/minted
// ---------------------------------------------------------------------------

/**
 * Returns all on-chain confirmed badge mints for the wallet.
 *
 * 200 [{ badge_type, confirmed_at, transaction_hash }]
 */
router.get(
  '/minted',
  asyncHandler(async (req, res) => {
    const { wallet } = req.params as { wallet: string };
    req.log.info({ wallet }, 'GET /wallets/:wallet/badges/minted');
    const minted = await getMintedBadges(wallet);
    return res.json({ status: 'success', data: minted });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/wallets/:wallet/badges/redeem
// ---------------------------------------------------------------------------

/**
 * Claims a secret (redeem-code) badge off-chain.
 */
router.post(
  '/redeem',
  asyncHandler(async (req, res) => {
    const { wallet } = req.params as { wallet: string };
    const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    req.log.info({ wallet, code: rawCode }, 'POST /wallets/:wallet/badges/redeem');

    // TODO(auth): same wallet-in-URL trust as every other wallet route. When the
    // API-wide auth hardening lands this endpoint follows along.

    if (!rawCode) {
      return sendError(res, 'A code is required.', null, 400);
    }

    const { success, errors, errorMessage, profileData } = await getProfile(wallet);

    if (!success || !profileData) {
      req.log.error({ errors, errorMessage, wallet }, 'Profile not resolved for redeem');
      return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
    }

    const result = await redeemAchievementCode(profileData.id, rawCode);

    if (!result.success) {
      if (result.notFound) {
        req.log.info({ profileId: profileData.id, code: rawCode }, 'Redeem code not found');
        return sendError(res, 'That code is not valid.', null, 404);
      }
      if (result.alreadyClaimed) {
        req.log.info({ profileId: profileData.id, code: rawCode }, 'Redeem code already claimed');
        return sendError(res, 'You already claimed this achievement.', null, 409);
      }
      req.log.error({ err: result.error, profileId: profileData.id, code: rawCode }, 'Failed to redeem code');
      return sendError(res, 'Failed to redeem code', result.error, 500);
    }

    try {
      await broadcastProfileChange('achievement-claimed', [
        'profile-achievements',
        'profile-rewards',
        'profile-experience',
      ]);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast (achievement-claimed via redeem)');
    }

    req.log.info(
      { profileId: profileData.id, key: result.achievementKey, coinReward: result.coinReward },
      'Achievement claimed via redeem code',
    );
    return sendSuccess(res, {
      achievementKey: result.achievementKey,
      coinReward: result.coinReward,
      claimedAt: result.claimedAt,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/wallets/:wallet/badges/:key/claim
// ---------------------------------------------------------------------------

/**
 * Claims an achievement off-chain (writes profiles_achievements + credits coins).
 * Re-validates eligibility (rule / leaderboard rank) at claim time.
 */
router.post(
  '/:key/claim',
  asyncHandler(async (req, res) => {
    const { wallet, key } = req.params as { wallet: string; key: string };
    req.log.info({ wallet, key }, 'POST /wallets/:wallet/badges/:key/claim');

    // TODO(auth): match the wallet-in-URL trust used by every other wallet
    // route for v1. When we harden auth across the API (challenge/response via
    // StellarWalletsKit.signMessage verified server-side), this endpoint moves
    // along with the rest — don't add a one-off signature check here.

    const { success, errors, errorMessage, profileData } = await getProfile(wallet);

    if (!success || !profileData) {
      req.log.error({ errors, errorMessage, wallet }, 'Profile not resolved for achievement claim');
      return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
    }

    const achievementKey = key as Achievement;

    // The catalog (DB) is the source of truth for which badges exist — admin can
    // add new ones beyond the static Achievement enum, so we validate against the
    // row, not the enum.
    const { data: achievementDoc } = await getAchievementByKey(achievementKey);
    if (!achievementDoc) {
      req.log.warn({ key }, 'Unknown achievement key');
      return sendError(res, `Unknown achievement: ${key}`, null, 404);
    }

    if (achievementDoc.unlock_type === 'cycle_rank' || achievementDoc.cycle_scoped) {
      // Leaderboard badges: verify rank against the last closed cycle.
      const cycleId = await getLastClosedCycleId();
      const rank = await getLeaderboardRankForWallet(wallet, cycleId);
      const exactRank: Record<string, number> = { 'first-place': 1, 'second-place': 2 };
      const eligible =
        achievementKey === 'third-place'
          ? rank !== null && rank >= 3 && rank <= 10
          : rank === exactRank[achievementKey];
      if (!eligible) {
        req.log.warn({ profileId: profileData.id, key, rank, cycleId }, 'Wallet did not finish at required leaderboard rank');
        return sendError(res, 'You did not finish at the required leaderboard rank last cycle.', null, 403);
      }
    } else if (achievementDoc.unlock_type === 'rule') {
      // Signal-driven badges: evaluate the configurable rule.
      const signals = await computeEligibilitySignals(profileData);
      if (!isAchievementEligible(achievementDoc, signals)) {
        req.log.warn(
          { profileId: profileData.id, key, signals },
          'Profile is not eligible for achievement',
        );
        return sendError(res, 'You are not eligible for this achievement yet.', null, 403);
      }
    } else {
      // redeem_code / manual badges are not claimable through this endpoint.
      req.log.warn({ profileId: profileData.id, key, unlockType: achievementDoc.unlock_type }, 'Achievement not claimable via this endpoint');
      return sendError(
        res,
        achievementDoc.unlock_type === 'redeem_code'
          ? 'This badge is claimable only with a redeem code.'
          : 'This badge is granted manually and cannot be claimed here.',
        null,
        403,
      );
    }

    const result = await claimAchievement(profileData.id, achievementKey);

    if (!result.success) {
      if (result.alreadyClaimed) {
        req.log.info({ profileId: profileData.id, key }, 'Achievement already claimed');
        return sendError(res, 'You already claimed this achievement.', null, 409);
      }
      req.log.error({ err: result.error, profileId: profileData.id, key }, 'Failed to claim achievement');
      return sendError(res, 'Failed to claim achievement', result.error, 500);
    }

    try {
      await broadcastProfileChange('achievement-claimed', [
        'profile-achievements',
        'profile-rewards',
        'profile-experience',
      ]);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (achievement-claimed)');
    }

    req.log.info({ profileId: profileData.id, key, coinReward: result.coinReward }, 'Achievement claimed');
    return sendSuccess(res, {
      achievementKey,
      coinReward: result.coinReward,
      claimedAt: result.claimedAt,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/v1/wallets/:wallet/badges/:key/voucher
// ---------------------------------------------------------------------------

/**
 * Returns a signed claim payload ready to pass to `mint_badge` on-chain.
 * Gate: wallet must have a row in profiles_achievements for this badge.
 *
 * 200 { badge_type, cycle_id, expiry, signature }
 * 400 missing / unknown parameters
 * 403 wallet has not claimed the achievement off-chain yet
 * 503 badges_contract_address not configured
 */
router.get(
  '/:key/voucher',
  asyncHandler(async (req, res) => {
    const { wallet, key: badgeType } = req.params as { wallet: string; key: string };

    const badgesContractAddress = await getBadgesContractAddress();
    if (!badgesContractAddress) {
      req.log.error('badges_contract_address not configured');
      return res.status(503).json({ status: 'error', message: 'Badge contract not configured' });
    }

    // Verify the achievement exists in the catalog
    const achievement = await prisma.achievement.findFirst({
      where: { key: badgeType, deletedAt: null },
      select: { id: true, cycleScoped: true, refreshPolicy: true, tier: true },
    });

    if (!achievement) {
      return res.status(400).json({ status: 'error', message: `Unknown badge type: ${badgeType}` });
    }

    const contractSymbol: string = achievement.tier ?? badgeType;

    req.log.info({ badgeType, wallet }, 'GET /wallets/:wallet/badges/:key/voucher');

    // Gate: wallet must have claimed the achievement off-chain
    const profile = await prisma.profile.findFirst({
      where: { walletAddress: wallet },
      select: { id: true },
    });

    if (!profile) {
      return res.status(403).json({ status: 'error', message: 'Wallet is not eligible for this badge' });
    }

    const claimed = await prisma.profileAchievement.findFirst({
      where: { profileId: profile.id, achievementId: achievement.id },
      select: { id: true },
    });

    if (!claimed) {
      req.log.info({ badgeType, wallet }, 'Achievement not yet claimed off-chain');
      return res.status(403).json({ status: 'error', message: 'Achievement not yet earned. Complete the challenge first.' });
    }

    const cycleId = achievement.cycleScoped ? await getLastClosedCycleId() : 0;

    // Return existing unexpired active claim if present
    const existing = await getActiveBadgeClaim(wallet, badgeType, cycleId);
    if (existing) {
      const expiryUnix = Math.floor(new Date(existing.expiry).getTime() / 1000);
      const nowUnix = Math.floor(Date.now() / 1000);
      if (expiryUnix > nowUnix) {
        req.log.info({ badgeType, wallet, claimId: existing.id }, 'Returning existing active claim');
        return res.json({ status: 'success', data: toClaimPayload(existing, contractSymbol) });
      }
    }

    // Issue a new signed claim — sign with the tier (Soroban Symbol) not the key
    let keypair;
    try {
      keypair = getBadgeSigningKeypair();
    } catch {
      return res.status(500).json({ status: 'error', message: 'Badge signing key not configured' });
    }

    const expiry = makeClaimExpiry();
    const signature = signBadgeClaim(badgesContractAddress, wallet, contractSymbol, cycleId, expiry, keypair);
    const stored = await storeBadgeClaim({ walletAddress: wallet, badgeType, cycleId, expiry, signature });

    req.log.info({ badgeType, wallet, claimId: stored.id }, 'Issued new badge claim');
    return res.json({ status: 'success', data: toClaimPayload(stored, contractSymbol) });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/wallets/:wallet/badges/:key/voucher/refresh
// ---------------------------------------------------------------------------

/**
 * Re-issues a fresh signed claim whose original signature has expired.
 * Uses profiles_achievements as the eligibility gate.
 *
 * 200 { badge_type, cycle_id, expiry, signature }
 * 400 missing / invalid body params
 * 403 manual badge (requires admin re-sign) or achievement not yet earned
 * 409 badge already minted on-chain for this wallet
 * 503 badges_contract_address not configured
 */
router.post(
  '/:key/voucher/refresh',
  asyncHandler(async (req, res) => {
    const { wallet, key: badgeType } = req.params as { wallet: string; key: string };
    const { cycle_id: cycleIdRaw } = req.body as { cycle_id?: unknown };

    if (cycleIdRaw == null) {
      return res.status(400).json({ status: 'error', message: 'Missing cycle_id' });
    }

    const cycleId = Number(cycleIdRaw);
    if (!Number.isInteger(cycleId) || cycleId < 0) {
      return res.status(400).json({ status: 'error', message: 'cycle_id must be a non-negative integer' });
    }

    const contractId = await getBadgesContractAddress();
    if (!contractId) {
      req.log.error('badges_contract_address not configured');
      return res.status(503).json({ status: 'error', message: 'Badge contract not configured' });
    }

    req.log.info({ badgeType, wallet, cycleId }, 'POST /wallets/:wallet/badges/:key/voucher/refresh');

    // Check refresh_policy — manual badges require admin action
    const achievement = await prisma.achievement.findFirst({
      where: { key: badgeType, deletedAt: null },
      select: { id: true, refreshPolicy: true, tier: true },
    });

    if (!achievement) {
      return res.status(400).json({ status: 'error', message: `Unknown badge type: ${badgeType}` });
    }

    if (achievement.refreshPolicy === 'manual') {
      return res.status(403).json({
        status: 'error',
        message: 'Manual badges require admin re-sign. Contact support@vaquita.fi',
      });
    }

    const contractSymbol: string = achievement.tier ?? badgeType;

    // Check if already minted on-chain (use tier as the contract Symbol)
    const alreadyMinted = await contractHasClaimed(contractId, wallet, contractSymbol, cycleId);
    if (alreadyMinted) {
      return res.status(409).json({ status: 'error', message: 'Badge already minted on-chain' });
    }

    // Gate: wallet must have claimed the achievement off-chain
    const profile = await prisma.profile.findFirst({
      where: { walletAddress: wallet },
      select: { id: true },
    });

    if (!profile) {
      return res.status(403).json({ status: 'error', message: 'Achievement not yet earned' });
    }

    const claimed = await prisma.profileAchievement.findFirst({
      where: { profileId: profile.id, achievementId: achievement.id },
      select: { id: true },
    });

    if (!claimed) {
      return res.status(403).json({ status: 'error', message: 'Achievement not yet earned' });
    }

    // Supersede any active (unexpired) prior claim
    const existingClaim = await getActiveBadgeClaim(wallet, badgeType, cycleId);
    if (existingClaim) {
      await supersedeBadgeClaim(existingClaim.id);
    }

    // Issue fresh claim — sign with the tier (Soroban Symbol) not the key
    let keypair;
    try {
      keypair = getBadgeSigningKeypair();
    } catch {
      return res.status(500).json({ status: 'error', message: 'Badge signing key not configured' });
    }

    const expiry = makeClaimExpiry();
    const signature = signBadgeClaim(contractId, wallet, contractSymbol, cycleId, expiry, keypair);
    const stored = await storeBadgeClaim({ walletAddress: wallet, badgeType, cycleId, expiry, signature });

    req.log.info({ badgeType, wallet, cycleId, claimId: stored.id }, 'Refreshed badge claim');
    return res.json({ status: 'success', data: toClaimPayload(stored, contractSymbol) });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/wallets/:wallet/badges/:key/mint
// ---------------------------------------------------------------------------

/**
 * Records that the on-chain mint landed: marks the active claim confirmed with
 * the transaction hash.
 *
 * 200 success
 * 400 missing required fields
 */
router.post(
  '/:key/mint',
  asyncHandler(async (req, res) => {
    const { wallet, key: badgeType } = req.params as { wallet: string; key: string };
    const { cycle_id: cycleIdRaw, transaction_hash: txHash } = req.body as {
      cycle_id?: unknown;
      transaction_hash?: string;
    };

    if (cycleIdRaw == null || !txHash) {
      return res.status(400).json({ status: 'error', message: 'Missing cycle_id or transaction_hash' });
    }

    const cycleId = Number(cycleIdRaw);
    if (!Number.isInteger(cycleId) || cycleId < 0) {
      return res.status(400).json({ status: 'error', message: 'cycle_id must be a non-negative integer' });
    }

    req.log.info({ badgeType, wallet, cycleId, txHash }, 'POST /wallets/:wallet/badges/:key/mint');
    await confirmBadgeClaim(wallet, badgeType, cycleId, txHash);
    return res.json({ status: 'success', data: null });
  }),
);

export default router;
