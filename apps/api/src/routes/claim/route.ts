import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import {
  checkGenesisSaverEligibility,
  checkPrimeraVaquitaEligibility,
  getActiveBadgeClaim,
  getBadgeSigningKeypair,
  makeClaimExpiry,
  signBadgeClaim,
  storeBadgeClaim,
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

// ---------------------------------------------------------------------------
// Supported Cat C badge types and their eligibility checkers
// ---------------------------------------------------------------------------

type EligibilityChecker = (wallet: string) => Promise<boolean>;

const BADGE_ELIGIBILITY: Record<string, { cycleId: number; check: EligibilityChecker }> = {
  primera_vaquita: {
    cycleId: 0,
    check: checkPrimeraVaquitaEligibility,
  },
  genesis_saver: {
    cycleId: 0,
    check: checkGenesisSaverEligibility,
  },
};

// ---------------------------------------------------------------------------
// GET /api/v1/claim?type=primera_vaquita&wallet=G...
// ---------------------------------------------------------------------------

/**
 * Returns a signed claim payload ready to pass to `mint_badge` on-chain.
 *
 * 200 { badge_type, cycle_id, expiry, signature }
 * 400 missing / unknown parameters
 * 403 wallet is not eligible for the requested badge type
 * 409 wallet already has an unexpired active claim (not yet minted)
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { type: badgeType, wallet } = req.query as { type?: string; wallet?: string };

    if (!badgeType || !wallet) {
      return res.status(400).json({ status: 'error', message: 'Missing type or wallet query param' });
    }

    const badgeConfig = BADGE_ELIGIBILITY[badgeType];
    if (!badgeConfig) {
      return res.status(400).json({ status: 'error', message: `Unknown badge type: ${badgeType}` });
    }

    req.log.info({ badgeType, wallet }, 'GET /claim');

    // Check eligibility
    const eligible = await badgeConfig.check(wallet);
    if (!eligible) {
      req.log.info({ badgeType, wallet }, 'Wallet not eligible for badge');
      return res.status(403).json({ status: 'error', message: 'Wallet is not eligible for this badge' });
    }

    const { cycleId } = badgeConfig;

    // Return existing unexpired active claim if present
    const existing = await getActiveBadgeClaim(wallet, badgeType, cycleId);
    if (existing) {
      const expiryUnix = Math.floor(new Date(existing.expiry).getTime() / 1000);
      const nowUnix = Math.floor(Date.now() / 1000);
      if (expiryUnix > nowUnix) {
        req.log.info({ badgeType, wallet, claimId: existing.id }, 'Returning existing active claim');
        return res.json({ status: 'success', data: toClaimPayload(existing) });
      }
      // Claim expired — fall through to issue a fresh one (supersede handled below)
    }

    // Issue a new signed claim
    const expiry = makeClaimExpiry();
    let keypair;
    try {
      keypair = getBadgeSigningKeypair();
    } catch {
      return res.status(500).json({ status: 'error', message: 'Badge signing key not configured' });
    }

    const signature = signBadgeClaim(wallet, badgeType, cycleId, expiry, keypair);
    const stored = await storeBadgeClaim({ walletAddress: wallet, badgeType, cycleId, expiry, signature });

    req.log.info({ badgeType, wallet, claimId: stored.id }, 'Issued new badge claim');
    return res.json({ status: 'success', data: toClaimPayload(stored) });
  }),
);

export default router;
