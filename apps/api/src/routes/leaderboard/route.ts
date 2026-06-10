import { Router } from 'express';
import {
  getLastClosedCycleId,
  getLeaderboard,
  getLeaderboardRankForWallet,
  parseLeaderboardCycleQuery,
  sendError,
  sendSuccess,
} from '@vaquita/shared';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/leaderboard/rank?wallet=G...
// ---------------------------------------------------------------------------

/**
 * Returns the 1-based rank of a wallet in the last closed cycle.
 * Single-network: no networkName param anymore.
 *
 * 200 { rank: number | null, cycleId: number }
 * 400 missing wallet param
 */
router.get('/rank', async (req, res) => {
  const { wallet } = req.query as { wallet?: string };

  if (!wallet) {
    return sendError(res, 'Missing wallet query param', null, 400);
  }

  req.log.info({ wallet }, 'GET /leaderboard/rank');

  try {
    const cycleId = await getLastClosedCycleId();
    const rank = await getLeaderboardRankForWallet(wallet, cycleId);
    return sendSuccess(res, { rank, cycleId }, '');
  } catch (err: any) {
    req.log.error({ err, wallet }, 'Leaderboard rank query failed');
    return sendError(res, err?.message ?? 'Leaderboard rank query failed', err, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/leaderboard?cycle=current|last_closed|YYYYMM
// ---------------------------------------------------------------------------

/**
 * Returns the ranked leaderboard for a cycle.
 * Omit cycle or pass cycle=current for the current open configured cycle.
 *
 * 200 [ { position, walletAddress, score, activeAmount, cycleId, cycleStart, cycleEnd, cycleStatus } ]
 */
router.get('/', async (req, res) => {
  try {
    const { cycleId, cycleStatus } = await parseLeaderboardCycleQuery(req.query.cycle);
    req.log.info({ cycleId, cycleStatus }, 'GET /leaderboard');

    const rows = await getLeaderboard(cycleId);
    return sendSuccess(
      res,
      rows.map((row, index) => ({
        position: index + 1,
        ...row,
        cycleStatus,
      })),
      '',
    );
  } catch (err: any) {
    if (err?.message === 'cycle must be current, last_closed, or a positive integer cycle id') {
      return sendError(res, err.message, null, 400);
    }

    req.log.error({ err, cycle: req.query.cycle }, 'Leaderboard query failed');
    return sendError(res, err?.message ?? 'Leaderboard query failed', err, 500);
  }
});

export default router;
