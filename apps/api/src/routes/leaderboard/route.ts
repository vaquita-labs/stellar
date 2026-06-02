import { Router } from 'express';
import {
  getLastClosedCycleId,
  getLeaderboard,
  getLeaderboardRankForWallet,
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
    const cycleId = getLastClosedCycleId();
    const rank = await getLeaderboardRankForWallet(wallet, cycleId);
    return sendSuccess(res, { rank, cycleId }, '');
  } catch (err: any) {
    req.log.error({ err, wallet }, 'Leaderboard rank query failed');
    return sendError(res, err?.message ?? 'Leaderboard rank query failed', err, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/leaderboard?cycle=YYYYMM
// ---------------------------------------------------------------------------

/**
 * Returns the ranked leaderboard for a cycle.
 * Pass cycle=0 (or omit) for a live leaderboard ending at now.
 *
 * 200 [ { walletAddress, score, activeAmount, cycleStart, cycleEnd } ]
 */
router.get('/', async (req, res) => {
  const cycleIdRaw = req.query.cycle;
  const cycleId = cycleIdRaw ? Number(cycleIdRaw) : 0;

  if (!Number.isInteger(cycleId) || cycleId < 0) {
    return sendError(res, 'cycle must be a non-negative integer (YYYYMM)', null, 400);
  }

  req.log.info({ cycleId }, 'GET /leaderboard');

  try {
    const rows = await getLeaderboard(cycleId);
    return sendSuccess(res, rows, '');
  } catch (err: any) {
    req.log.error({ err, cycleId }, 'Leaderboard query failed');
    return sendError(res, err?.message ?? 'Leaderboard query failed', err, 500);
  }
});

export default router;
