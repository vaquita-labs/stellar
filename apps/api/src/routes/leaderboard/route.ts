import { Router } from 'express';
import {
  getEnrichedLeaderboard,
  getLastClosedCycleId,
  getLeaderboardRankForWallet,
  paginateLeaderboardRows,
  parseLeaderboardCycleQuery,
  parseLeaderboardPageQuery,
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
//   &limit=20&offset=0&search=&sort=rank|level|streak|badges&direction=asc|desc
// ---------------------------------------------------------------------------

/**
 * Returns one page of the ranked leaderboard for a cycle. Search + sort are
 * applied server-side (before slicing) so infinite-scroll pages stay globally
 * consistent. Omit cycle or pass cycle=current for the current open cycle.
 *
 * The enriched board is cached ~30s per cycle (shared across all viewers and
 * pages), so scrolling through pages costs one DB computation per window, not
 * one per request. Filtering/sorting/slicing happen per-request on the cached
 * array.
 *
 * 200 { rows: [ { position, walletAddress, nickname, ... } ], total, limit, offset, hasMore }
 */
router.get('/', async (req, res) => {
  try {
    const { cycleId, cycleStatus } = await parseLeaderboardCycleQuery(req.query.cycle);
    const pageParams = parseLeaderboardPageQuery(req.query);
    req.log.info({ cycleId, cycleStatus, ...pageParams }, 'GET /leaderboard');

    const enriched = await getEnrichedLeaderboard(cycleId, cycleStatus);

    return sendSuccess(res, paginateLeaderboardRows(enriched, pageParams), '');
  } catch (err: any) {
    if (err?.message === 'cycle must be current, last_closed, or a positive integer cycle id') {
      return sendError(res, err.message, null, 400);
    }

    req.log.error({ err, cycle: req.query.cycle }, 'Leaderboard query failed');
    return sendError(res, err?.message ?? 'Leaderboard query failed', err, 500);
  }
});

export default router;
