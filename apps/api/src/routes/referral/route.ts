import { Router } from 'express';
import {
  type ReferralSummaryResponseDTO,
  type ReferrerLeaderboardResponseDTO,
  getReferralSummary,
  getReferrerLeaderboard,
  sendError,
  sendSuccess,
} from '@vaquita/shared';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';

/**
 * Invite-a-friend (`/referrals`).
 *
 * `requireSessionWallet`, not the wallet-trust shape the older routes use: this
 * returns how many people a user brought in, and reading the summary is also
 * what mints the code. Taking the wallet from the URL would have let anyone
 * enumerate anyone else's referral graph, which stops being merely untidy the
 * day a payout is attached to it. The `:walletAddress` segment is kept so the
 * client and the logs stay readable, but the session is what decides.
 *
 * The old `POST /wallet/:walletAddress/redeem` lived here and is gone. It had no
 * session, upserted a profile row from an unauthenticated request, and had zero
 * callers — `POST /attribution` supersedes it, and is the only path that should
 * ever write `referred_by_id`.
 */
const router = Router();

// GET /api/v1/referrals/wallet/:walletAddress
// Referral summary for the invite screen: the user's shareable code, how many
// friends joined, and how many of them are saving.
router.get('/wallet/:walletAddress', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);
  req.log.info({ walletAddress }, 'GET /referrals/.../wallet');

  try {
    const summary: ReferralSummaryResponseDTO = await getReferralSummary(walletAddress);
    return sendSuccess(res, summary);
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to load referral summary');
    return sendError(res, 'Failed to load referral summary', err, 500);
  }
});

// GET /api/v1/referrals/leaderboard
// The in-app referrer board: the top referrers by friends joined, with friends
// saving beside each, plus the caller's own row so it can be pinned when they
// fall outside the slice.
//
// Session-guarded like its sibling, and for the same reason: this enumerates who
// brought whom. It carries counts only — never what anyone's referrals hold or
// have moved, which is what the metrics dashboard is for.
router.get('/leaderboard', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);
  req.log.info({ walletAddress }, 'GET /referrals/leaderboard');

  try {
    const board: ReferrerLeaderboardResponseDTO = await getReferrerLeaderboard(walletAddress);
    return sendSuccess(res, board);
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to load referrer leaderboard');
    return sendError(res, 'Failed to load referrer leaderboard', err, 500);
  }
});

export default router;
