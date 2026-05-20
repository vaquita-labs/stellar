import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import {
  checkDisciplinadoEligibility,
  checkFirstDepositEligibility,
  checkGenesisSaverEligibility,
  checkMainnetPioneerEligibility,
  checkMaratonistEligibility,
  checkPrimeraVaquitaEligibility,
  checkTrimestralEligibility,
  checkVeteranoEligibility,
  confirmBadgeClaim,
  contractHasClaimed,
  getActiveBadgeClaim,
  getAnyClaim,
  getBadgeSigningKeypair,
  getMintedBadges,
  getNetworkByName,
  makeClaimExpiry,
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

// ---------------------------------------------------------------------------
// Supported badge types and their eligibility checkers
// ---------------------------------------------------------------------------

type EligibilityChecker = (wallet: string) => Promise<boolean>;

const BADGE_ELIGIBILITY: Record<string, { cycleId: number; check: EligibilityChecker }> = {
  'first-deposit':  { cycleId: 0, check: checkFirstDepositEligibility },
  primera_vaquita:  { cycleId: 0, check: checkPrimeraVaquitaEligibility },
  maratonista:      { cycleId: 0, check: checkMaratonistEligibility },
  trimestral:       { cycleId: 0, check: checkTrimestralEligibility },
  veterano:         { cycleId: 0, check: checkVeteranoEligibility },
  disciplinado:     { cycleId: 0, check: checkDisciplinadoEligibility },
  genesis_saver:    { cycleId: 0, check: checkGenesisSaverEligibility },
  mainnet_pioneer:  { cycleId: 0, check: checkMainnetPioneerEligibility },
};

// ---------------------------------------------------------------------------
// GET /api/v1/claim/:networkName/minted?wallet=G...
// ---------------------------------------------------------------------------

/**
 * Returns all on-chain confirmed badge mints for a wallet.
 *
 * 200 [{ badge_type, confirmed_at, transaction_hash }]
 * 400 missing wallet param
 */
router.get(
  '/:networkName/minted',
  asyncHandler(async (req, res) => {
    const { wallet } = req.query as { wallet?: string };
    if (!wallet) {
      return res.status(400).json({ status: 'error', message: 'Missing wallet query param' });
    }
    req.log.info({ wallet }, 'GET /claim/:networkName/minted');
    const minted = await getMintedBadges(wallet);
    return res.json({ status: 'success', data: minted });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/claim/:networkName/confirm
// ---------------------------------------------------------------------------

/**
 * Marks the active claim as confirmed with the on-chain transaction hash.
 *
 * 200 success
 * 400 missing required fields
 */
router.post(
  '/:networkName/confirm',
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

    req.log.info({ badgeType, wallet, cycleId, txHash }, 'POST /claim/:networkName/confirm');
    await confirmBadgeClaim(wallet, badgeType, cycleId, txHash);
    return res.json({ status: 'success', data: null });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/v1/claim/:networkName?type=primera_vaquita&wallet=G...
// ---------------------------------------------------------------------------

/**
 * Returns a signed claim payload ready to pass to `mint_badge` on-chain.
 *
 * 200 { badge_type, cycle_id, expiry, signature }
 * 400 missing / unknown parameters
 * 403 wallet is not eligible for the requested badge type
 * 503 badges_contract_address not set for this network
 */
router.get(
  '/:networkName',
  asyncHandler(async (req, res) => {
    const { networkName } = req.params;
    const { type: badgeType, wallet } = req.query as { type?: string; wallet?: string };

    if (!badgeType || !wallet) {
      return res.status(400).json({ status: 'error', message: 'Missing type or wallet query param' });
    }

    const { data: network } = await getNetworkByName(networkName);
    if (!network) {
      return res.status(404).json({ status: 'error', message: `Network '${networkName}' not found` });
    }
    if (!network.badges_contract_address) {
      req.log.error({ networkName }, 'badges_contract_address not set for network');
      return res.status(503).json({ status: 'error', message: 'Badge contract not configured for this network' });
    }

    const badgeConfig = BADGE_ELIGIBILITY[badgeType];
    if (!badgeConfig) {
      return res.status(400).json({ status: 'error', message: `Unknown badge type: ${badgeType}` });
    }

    req.log.info({ badgeType, wallet, networkName }, 'GET /claim/:networkName');

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

// ---------------------------------------------------------------------------
// POST /api/v1/claim/:networkName/refresh
// ---------------------------------------------------------------------------

/**
 * Re-issues a fresh signed claim whose original signature has expired.
 * Automatically re-verifies eligibility before issuing.
 *
 * 200 { badge_type, cycle_id, expiry, signature }
 * 400 missing / invalid body params
 * 403 wallet no longer eligible
 * 409 badge already minted on-chain for this wallet
 * 503 badges_contract_address not set for this network
 */
router.post(
  '/:networkName/refresh',
  asyncHandler(async (req, res) => {
    const { networkName } = req.params;
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

    const { data: network } = await getNetworkByName(networkName);
    if (!network) {
      return res.status(404).json({ status: 'error', message: `Network '${networkName}' not found` });
    }
    const contractId = network.badges_contract_address;
    if (!contractId) {
      req.log.error({ networkName }, 'badges_contract_address not set for network');
      return res.status(503).json({ status: 'error', message: 'Badge contract not configured for this network' });
    }

    req.log.info({ badgeType, wallet, cycleId, networkName }, 'POST /claim/:networkName/refresh');

    // Check if already minted on-chain
    const alreadyMinted = await contractHasClaimed(contractId, wallet, badgeType, cycleId);
    if (alreadyMinted) {
      return res.status(409).json({ status: 'error', message: 'Badge already minted on-chain' });
    }

    // Verify eligibility
    const badgeConfig = BADGE_ELIGIBILITY[badgeType];
    if (badgeConfig) {
      const eligible = await badgeConfig.check(wallet);
      if (!eligible) {
        return res.status(403).json({ status: 'error', message: 'Wallet is not eligible for this badge' });
      }
    } else {
      // Leaderboard / manual badges: confirm a prior claim was issued for this exact cycle
      const prior = await getAnyClaim(wallet, badgeType, cycleId);
      if (!prior) {
        return res.status(403).json({
          status: 'error',
          message: 'No prior claim found for this wallet, badge type, and cycle',
        });
      }
    }

    // Supersede any active (unexpired) prior claim
    const existing = await getActiveBadgeClaim(wallet, badgeType, cycleId);
    if (existing) {
      await supersedeBadgeClaim(existing.id);
    }

    // Issue fresh claim
    let keypair;
    try {
      keypair = getBadgeSigningKeypair();
    } catch {
      return res.status(500).json({ status: 'error', message: 'Badge signing key not configured' });
    }

    const expiry = makeClaimExpiry();
    const signature = signBadgeClaim(wallet, badgeType, cycleId, expiry, keypair);
    const stored = await storeBadgeClaim({ walletAddress: wallet, badgeType, cycleId, expiry, signature });

    req.log.info({ badgeType, wallet, cycleId, claimId: stored.id }, 'Refreshed badge claim');
    return res.json({ status: 'success', data: toClaimPayload(stored) });
  }),
);

export default router;
