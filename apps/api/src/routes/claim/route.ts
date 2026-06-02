import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import {
  confirmBadgeClaim,
  contractHasClaimed,
  getActiveBadgeClaim,
  getBadgesContractAddress,
  getBadgeSigningKeypair,
  getLastClosedCycleId,
  getMintedBadges,
  makeClaimExpiry,
  prisma,
  signBadgeClaim,
  storeBadgeClaim,
  supersedeBadgeClaim,
  toClaimPayload,
} from '@vaquita/shared';

const router = Router();

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

// Single-network: the badge contract lives on the one configured network, so
// the legacy /:networkName path segment was removed.

// ---------------------------------------------------------------------------
// GET /api/v1/claim/minted?wallet=G...
// ---------------------------------------------------------------------------

/**
 * Returns all on-chain confirmed badge mints for a wallet.
 *
 * 200 [{ badge_type, confirmed_at, transaction_hash }]
 * 400 missing wallet param
 */
router.get(
  '/minted',
  asyncHandler(async (req, res) => {
    const { wallet } = req.query as { wallet?: string };
    if (!wallet) {
      return res.status(400).json({ status: 'error', message: 'Missing wallet query param' });
    }
    req.log.info({ wallet }, 'GET /claim/minted');
    const minted = await getMintedBadges(wallet);
    return res.json({ status: 'success', data: minted });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/claim/confirm
// ---------------------------------------------------------------------------

/**
 * Marks the active claim as confirmed with the on-chain transaction hash.
 *
 * 200 success
 * 400 missing required fields
 */
router.post(
  '/confirm',
  asyncHandler(async (req, res) => {
    const { badge_type: badgeType, wallet, cycle_id: cycleIdRaw, transaction_hash: txHash } = req.body as {
      badge_type?: string;
      wallet?: string;
      cycle_id?: unknown;
      transaction_hash?: string;
    };

    if (!badgeType || !wallet || cycleIdRaw == null || !txHash) {
      return res.status(400).json({ status: 'error', message: 'Missing badge_type, wallet, cycle_id, or transaction_hash' });
    }

    const cycleId = Number(cycleIdRaw);
    if (!Number.isInteger(cycleId) || cycleId < 0) {
      return res.status(400).json({ status: 'error', message: 'cycle_id must be a non-negative integer' });
    }

    req.log.info({ badgeType, wallet, cycleId, txHash }, 'POST /claim/confirm');
    await confirmBadgeClaim(wallet, badgeType, cycleId, txHash);
    return res.json({ status: 'success', data: null });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/v1/claim?type=<badge_key>&wallet=G...
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
  '/',
  asyncHandler(async (req, res) => {
    const { type: badgeType, wallet } = req.query as { type?: string; wallet?: string };

    if (!badgeType || !wallet) {
      return res.status(400).json({ status: 'error', message: 'Missing type or wallet query param' });
    }

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

    req.log.info({ badgeType, wallet }, 'GET /claim');

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

    const cycleId = achievement.cycleScoped ? getLastClosedCycleId() : 0;

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
    const signature = signBadgeClaim(wallet, contractSymbol, cycleId, expiry, keypair);
    const stored = await storeBadgeClaim({ walletAddress: wallet, badgeType, cycleId, expiry, signature });

    req.log.info({ badgeType, wallet, claimId: stored.id }, 'Issued new badge claim');
    return res.json({ status: 'success', data: toClaimPayload(stored, contractSymbol) });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/claim/refresh
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
  '/refresh',
  asyncHandler(async (req, res) => {
    const { wallet, badge_type: badgeType, cycle_id: cycleIdRaw } = req.body as {
      wallet?: string;
      badge_type?: string;
      cycle_id?: unknown;
    };

    if (!wallet || !badgeType || cycleIdRaw == null) {
      return res.status(400).json({ status: 'error', message: 'Missing wallet, badge_type, or cycle_id' });
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

    req.log.info({ badgeType, wallet, cycleId }, 'POST /claim/refresh');

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
    const signature = signBadgeClaim(wallet, contractSymbol, cycleId, expiry, keypair);
    const stored = await storeBadgeClaim({ walletAddress: wallet, badgeType, cycleId, expiry, signature });

    req.log.info({ badgeType, wallet, cycleId, claimId: stored.id }, 'Refreshed badge claim');
    return res.json({ status: 'success', data: toClaimPayload(stored, contractSymbol) });
  }),
);

export default router;
