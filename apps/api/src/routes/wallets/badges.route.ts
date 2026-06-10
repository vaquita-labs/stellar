import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import { requireWalletParamSession } from '../../lib/walletAuth';
import {
  Achievement,
  broadcastProfileChange,
  claimAchievement,
  computeEligibilitySignals,
  confirmBadgeClaim,
  contractHasClaimed,
  type AchievementDocument,
  getAchievementByKey,
  getAchievementByCode,
  getActiveBadgeClaim,
  getBadgeSigningKeypair,
  getBadgesContractAddress,
  getLastClosedCycleId,
  getLeaderboardRankForWallet,
  getNetworkName,
  getProfile,
  isAchievementEligible,
  makeClaimExpiry,
  prisma,
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

const lifecycleError = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ status: 'error', code, message });

const medalEligible = (achievementKey: string, rank: number | null): boolean => {
  if (achievementKey === 'first-place') return rank === 1;
  if (achievementKey === 'second-place') return rank === 2;
  if (achievementKey === 'third-place') return rank !== null && rank >= 3 && rank <= 10;
  return false;
};

async function resolveVoucherCycleId(
  wallet: string,
  profileId: number,
  achievement: AchievementDocument,
): Promise<{ ok: true; cycleId: number } | { ok: false; status: number; code: string; message: string }> {
  if (achievement.unlock_type === 'rule') {
    const profile = await prisma.profile.findUnique({ where: { id: profileId } });
    if (!profile) {
      return { ok: false, status: 404, code: 'PROFILE_NOT_FOUND', message: 'Profile not resolved' };
    }
    const signals = await computeEligibilitySignals({
      id: profile.id,
      network_id: 0,
      email: profile.email ?? '',
      full_name: profile.fullName ?? '',
      nickname: profile.nickname ?? '',
      wallet_address: profile.walletAddress,
      avatar_url: profile.avatarUrl ?? null,
      avatar_key: profile.avatarKey ?? null,
      onboarding_completed: profile.onboardingCompleted ?? false,
      tutorial_completed: profile.tutorialCompleted ?? false,
      crypto_savvy: profile.cryptoSavvy ?? false,
      language: profile.language ?? null,
      currency: profile.currency ?? null,
      notification_preferences: null,
      created_at: profile.createdAt?.toISOString(),
      updated_at: profile.updatedAt?.toISOString(),
    });
    const eligible = isAchievementEligible(achievement, signals);
    return eligible
      ? { ok: true, cycleId: 0 }
      : { ok: false, status: 403, code: 'NO_LONGER_ELIGIBLE', message: 'You are not eligible for this badge yet.' };
  }

  if (achievement.unlock_type === 'cycle_rank' || achievement.cycle_scoped) {
    const cycleId = await getLastClosedCycleId();
    const rank = await getLeaderboardRankForWallet(wallet, cycleId);
    return medalEligible(achievement.key, rank)
      ? { ok: true, cycleId }
      : {
          ok: false,
          status: 403,
          code: 'NO_LONGER_ELIGIBLE',
          message: 'You did not finish at the required leaderboard rank last cycle.',
        };
  }

  if (achievement.unlock_type === 'redeem_code') {
    return { ok: true, cycleId: 0 };
  }

  return {
    ok: false,
    status: 403,
    code: 'MANUAL_BADGE',
    message: 'This badge is granted manually and cannot be claimed here.',
  };
}

async function issueOrReturnVoucher(wallet: string, badgeType: string, cycleId: number, contractSymbol: string) {
  const existing = await getActiveBadgeClaim(wallet, badgeType, cycleId);
  if (existing) {
    const expiryUnix = Math.floor(new Date(existing.expiry).getTime() / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (expiryUnix > nowUnix) return existing;
  }

  const keypair = getBadgeSigningKeypair();
  const contractId = await getBadgesContractAddress();
  if (!contractId) throw new Error('Badge contract not configured');
  const expiry = makeClaimExpiry();
  const signature = signBadgeClaim(contractId, wallet, contractSymbol, cycleId, expiry, keypair);
  return storeBadgeClaim({ walletAddress: wallet, badgeType, cycleId, expiry, signature });
}

// ---------------------------------------------------------------------------
// GET /api/v1/wallets/:wallet/badges
// ---------------------------------------------------------------------------

/**
 * Lists every badge with this wallet's full lifecycle status per row: `unlocked`
 * (eligible), `claimedAt` (claimed off-chain) and `minted` (confirmed on-chain),
 * plus coin reward. Single source of truth for the badges grid.
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
// POST /api/v1/wallets/:wallet/badges/redeem
// ---------------------------------------------------------------------------

/**
 * Claims a secret (redeem-code) badge off-chain.
 */
router.post(
  '/redeem',
  requireWalletParamSession,
  asyncHandler(async (req, res) => {
    const { wallet } = req.params as { wallet: string };
    const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    req.log.info({ wallet, code: rawCode }, 'POST /wallets/:wallet/badges/redeem');

    if (!rawCode) {
      return sendError(res, 'A code is required.', null, 400);
    }

    const { success, errors, errorMessage, profileData } = await getProfile(wallet);

    if (!success || !profileData) {
      req.log.error({ errors, errorMessage, wallet }, 'Profile not resolved for redeem');
      return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
    }

    const { data: achievement, error: lookupError } = await getAchievementByCode(rawCode);
    if (lookupError) {
      req.log.error({ err: lookupError, profileId: profileData.id, code: rawCode }, 'Failed to redeem code');
      return lifecycleError(res, 500, 'REDEEM_LOOKUP_FAILED', 'Failed to redeem code');
    }
    if (!achievement) {
      req.log.info({ profileId: profileData.id, code: rawCode }, 'Redeem code not found');
      return lifecycleError(res, 404, 'UNKNOWN_REDEEM_CODE', 'That code is not valid.');
    }
    if (achievement.unlock_type !== 'redeem_code') {
      return lifecycleError(res, 400, 'INVALID_REDEEM_BADGE', 'That code is not valid for a redeemable badge.');
    }

    const contractSymbol = achievement.tier ?? achievement.key;
    const claim = await issueOrReturnVoucher(wallet, achievement.key, 0, contractSymbol);

    await broadcastProfileChange('badge-voucher-created', ['profile-achievements']).catch((err) => {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast badge voucher creation');
    });

    req.log.info({ profileId: profileData.id, key: achievement.key, claimId: claim.id }, 'Redeem code authorized pending mint');
    return sendSuccess(res, {
      achievementKey: achievement.key,
      coinReward: achievement.coin_reward,
      claim: toClaimPayload(claim, contractSymbol),
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
  requireWalletParamSession,
  asyncHandler(async (req, res) => {
    const { wallet, key } = req.params as { wallet: string; key: string };
    req.log.info({ wallet, key }, 'POST /wallets/:wallet/badges/:key/claim');

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

    req.log.info({ profileId: profileData.id, key }, 'Deprecated claim endpoint blocked before reward finalization');
    return lifecycleError(
      res,
      410,
      'CLAIM_ENDPOINT_DEPRECATED',
      'Claiming now requires minting on-chain first. Request a voucher and confirm the mint.',
    );
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
  requireWalletParamSession,
  asyncHandler(async (req, res) => {
    const { wallet, key: badgeType } = req.params as { wallet: string; key: string };

    const badgesContractAddress = await getBadgesContractAddress();
    if (!badgesContractAddress) {
      req.log.error('badges_contract_address not configured');
      return res.status(503).json({ status: 'error', message: 'Badge contract not configured' });
    }

    const { data: achievement } = await getAchievementByKey(badgeType as Achievement);
    if (!achievement) {
      return lifecycleError(res, 400, 'UNKNOWN_BADGE', `Unknown badge type: ${badgeType}`);
    }

    const contractSymbol: string = achievement.tier ?? badgeType;

    req.log.info({ badgeType, wallet }, 'GET /wallets/:wallet/badges/:key/voucher');

    const { success, errorMessage, errors, profileData } = await getProfile(wallet);
    if (!success || !profileData) {
      req.log.error({ errors, errorMessage, wallet }, 'Profile not resolved for badge voucher');
      return lifecycleError(res, 404, 'PROFILE_NOT_FOUND', errorMessage ?? 'Profile not resolved');
    }

    const resolved = await resolveVoucherCycleId(wallet, profileData.id, achievement);
    if (!resolved.ok) {
      return lifecycleError(res, resolved.status, resolved.code, resolved.message);
    }
    const cycleId = resolved.cycleId;

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

    let stored;
    try {
      stored = await issueOrReturnVoucher(wallet, badgeType, cycleId, contractSymbol);
    } catch (err) {
      req.log.error({ err, badgeType, wallet }, 'Failed to issue badge claim');
      return lifecycleError(res, 500, 'SIGNING_KEY_UNAVAILABLE', 'Badge signing key not configured');
    }

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
  requireWalletParamSession,
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

    const { data: achievement } = await getAchievementByKey(badgeType as Achievement);
    if (!achievement) {
      return lifecycleError(res, 400, 'UNKNOWN_BADGE', `Unknown badge type: ${badgeType}`);
    }

    const { success, errorMessage, errors, profileData } = await getProfile(wallet);
    if (!success || !profileData) {
      req.log.error({ errors, errorMessage, wallet }, 'Profile not resolved for badge voucher refresh');
      return lifecycleError(res, 404, 'PROFILE_NOT_FOUND', errorMessage ?? 'Profile not resolved');
    }

    const resolved = await resolveVoucherCycleId(wallet, profileData.id, achievement);
    if (!resolved.ok) {
      return lifecycleError(res, resolved.status, resolved.code, resolved.message);
    }
    if (resolved.cycleId !== cycleId) {
      return lifecycleError(res, 409, 'STALE_LEADERBOARD_CYCLE', 'This badge voucher is for an expired award cycle.');
    }

    const contractSymbol: string = achievement.tier ?? badgeType;

    // Check if already minted on-chain (use tier as the contract Symbol)
    const alreadyMinted = await contractHasClaimed(contractId, wallet, contractSymbol, cycleId);
    if (alreadyMinted) {
      return res.status(409).json({ status: 'error', message: 'Badge already minted on-chain' });
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
  requireWalletParamSession,
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

    const { data: achievement } = await getAchievementByKey(badgeType as Achievement);
    if (!achievement) {
      return lifecycleError(res, 400, 'UNKNOWN_BADGE', `Unknown badge type: ${badgeType}`);
    }

    const { success, errorMessage, errors, profileData } = await getProfile(wallet);
    if (!success || !profileData) {
      req.log.error({ errors, errorMessage, wallet }, 'Profile not resolved for badge mint finalization');
      return lifecycleError(res, 404, 'PROFILE_NOT_FOUND', errorMessage ?? 'Profile not resolved');
    }

    if (achievement.unlock_type === 'cycle_rank' || achievement.cycle_scoped) {
      const lastClosedCycleId = await getLastClosedCycleId();
      if (cycleId !== lastClosedCycleId) {
        return lifecycleError(res, 409, 'STALE_LEADERBOARD_CYCLE', 'This badge voucher is for an expired award cycle.');
      }
    }

    const pendingClaim = await getActiveBadgeClaim(wallet, badgeType, cycleId);
    if (!pendingClaim) {
      const alreadyFinalized = await prisma.profileAchievement.findFirst({
        where: { profileId: profileData.id, achievementId: achievement.id },
        select: { claimedAt: true },
      });
      if (alreadyFinalized) {
        return sendSuccess(res, {
          achievementKey: badgeType,
          coinReward: 0,
          claimedAt: alreadyFinalized.claimedAt.toISOString(),
          transactionHash: txHash,
        });
      }
      return lifecycleError(res, 404, 'NO_PENDING_VOUCHER', 'No pending badge voucher was found for this mint.');
    }

    const resolved = await resolveVoucherCycleId(wallet, profileData.id, achievement);
    if (!resolved.ok) {
      return lifecycleError(res, resolved.status, resolved.code, resolved.message);
    }
    if (resolved.cycleId !== cycleId) {
      return lifecycleError(res, 409, 'STALE_LEADERBOARD_CYCLE', 'This badge voucher is for an expired award cycle.');
    }

    const confirmedClaim = await confirmBadgeClaim(wallet, badgeType, cycleId, txHash);
    if (!confirmedClaim) {
      return lifecycleError(res, 404, 'NO_PENDING_VOUCHER', 'No pending badge voucher was found for this mint.');
    }

    const result = await claimAchievement(profileData.id, achievement.key as Achievement);
    if (!result.success) {
      if (result.alreadyClaimed) {
        const alreadyFinalized = await prisma.profileAchievement.findFirst({
          where: { profileId: profileData.id, achievementId: achievement.id },
          select: { claimedAt: true },
        });
        return sendSuccess(res, {
          achievementKey: badgeType,
          coinReward: 0,
          claimedAt: alreadyFinalized?.claimedAt.toISOString() ?? new Date().toISOString(),
          transactionHash: txHash,
        });
      }
      req.log.error({ err: result.error, profileId: profileData.id, key: badgeType }, 'Failed to finalize minted achievement');
      return lifecycleError(res, 500, 'FINALIZATION_FAILED', 'Failed to finalize minted achievement.');
    }

    await broadcastProfileChange('achievement-claimed', [
      'profile-achievements',
      'profile-rewards',
      'profile-experience',
    ]).catch((err) => {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change after mint finalization');
    });

    return sendSuccess(res, {
      achievementKey: badgeType,
      coinReward: result.coinReward,
      claimedAt: result.claimedAt,
      transactionHash: txHash,
    });
  }),
);

export default router;
