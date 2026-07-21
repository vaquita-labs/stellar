import { Router } from 'express';
import {
  type ReferralSummaryResponseDTO,
  getReferralSummary,
  redeemReferralCode,
  sendError,
  sendSuccess,
} from '@vaquita/shared';

const router = Router();

// Single-network + wallet-trust auth, same as the rest of the API: the viewer is
// identified by the `walletAddress` in the URL, no session/JWT.

// GET /api/v1/referrals/wallet/:walletAddress
// Referral summary for the Referrals screen: the user's shareable code, active
// referral count, the derived APY bonus + next tier, and the tier table.
router.get('/wallet/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /referrals/.../wallet');

  try {
    const summary: ReferralSummaryResponseDTO = await getReferralSummary(walletAddress);
    return sendSuccess(res, summary);
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to load referral summary');
    return sendError(res, 'Failed to load referral summary', err, 500);
  }
});

// POST /api/v1/referrals/wallet/:walletAddress/redeem  body: { code }
// Attributes this wallet to the owner of `code` (one-time, at signup). Returns
// 400 with a human message on an invalid / self / already-used code.
router.post('/wallet/:walletAddress/redeem', async (req, res) => {
  const { walletAddress } = req.params;
  const code = String(req.body?.code ?? '').trim();
  req.log.info({ walletAddress, code }, 'POST /referrals/.../redeem');

  if (!code) {
    return sendError(res, 'A referral code is required.', null, 400);
  }

  try {
    const result = await redeemReferralCode(walletAddress, code);
    if (!result.success) {
      return sendError(res, result.errorMessage, null, 400);
    }
    return sendSuccess(res, { walletAddress, referrerWallet: result.referrerWallet });
  } catch (err) {
    req.log.error({ err, walletAddress, code }, 'Failed to redeem referral code');
    return sendError(res, 'Failed to redeem referral code', err, 500);
  }
});

export default router;
