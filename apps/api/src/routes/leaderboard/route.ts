import { Router } from 'express';
import {
  enrichLeaderboardRows,
  getAchievementCountsByProfile,
  getExperienceByProfile,
  getLastClosedCycleId,
  getLeaderboard,
  getLeaderboardRankForWallet,
  getProfiles,
  getStreakCountsByProfile,
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
    const { data: profiles, error: profilesError } = await getProfiles();
    if (profilesError) {
      req.log.error({ err: profilesError }, 'Failed to load profile metadata for leaderboard');
      return sendError(res, 'Failed to load profile metadata for leaderboard', profilesError, 500);
    }

    const [
      { counts: badgesByProfileId, error: badgesError },
      { counts: streaksByProfileId, error: streaksError },
      { experience: experienceByProfileId, error: experienceError },
    ] = await Promise.all([
      getAchievementCountsByProfile(),
      getStreakCountsByProfile(),
      getExperienceByProfile(profiles),
    ]);

    if (badgesError) {
      req.log.error({ err: badgesError }, 'Failed to fetch badge counts for leaderboard');
    }
    if (streaksError) {
      req.log.error({ err: streaksError }, 'Failed to fetch streak counts for leaderboard');
    }
    if (experienceError) {
      req.log.error({ err: experienceError }, 'Failed to fetch experience for leaderboard');
    }

    return sendSuccess(
      res,
      enrichLeaderboardRows(
        rows,
        profiles,
        { badgesByProfileId, streaksByProfileId, experienceByProfileId },
        cycleStatus,
      ),
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
