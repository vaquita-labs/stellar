import { Router } from 'express';
import {
  getLeaderboard,
  getNetworkByName,
  getNetworksByOrigin,
  sendError,
  sendSuccess,
  toNetwork,
} from '@vaquita/shared';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/network/:networkName/leaderboard?cycle=YYYYMM
// ---------------------------------------------------------------------------

/**
 * Returns the ranked leaderboard for a cycle.
 * Pass cycle=0 (or omit) for a live leaderboard ending at now.
 *
 * 200 [ { walletAddress, score, activeAmount, cycleStart, cycleEnd } ]
 * 404 unknown network
 */
router.get('/:networkName/leaderboard', async (req, res) => {
  const { networkName } = req.params;
  const cycleIdRaw = req.query.cycle;
  const cycleId = cycleIdRaw ? Number(cycleIdRaw) : 0;

  if (!Number.isInteger(cycleId) || cycleId < 0) {
    return sendError(res, 'cycle must be a non-negative integer (YYYYMM)', null, 400);
  }

  req.log.info({ networkName, cycleId }, 'GET /network/:networkName/leaderboard');

  const { data: network, error } = await getNetworkByName(networkName);
  if (error || !network) {
    return sendError(res, error?.message || 'network not found', error, 404);
  }

  try {
    const rows = await getLeaderboard(cycleId, network.id as number);
    return sendSuccess(res, rows, '');
  } catch (err: any) {
    req.log.error({ err, networkName, cycleId }, 'Leaderboard query failed');
    return sendError(res, err?.message ?? 'Leaderboard query failed', err, 500);
  }
});

router.get('/:networkName', async (req, res) => {
  const { networkName } = req.params;
  req.log.info({ networkName }, 'GET /network/:networkName');

  const { data: network, error } = await getNetworkByName(networkName);

  if (error || !network) {
    req.log.error({ err: error, networkName }, 'Network not found');
    return sendError(res, error?.message || 'network not found', error, 404);
  }

  return sendSuccess(res, await toNetwork(network), '');
});

router.get('/', async (req, res) => {
  const origin = req.get('origin') || '';
  req.log.info({ origin }, 'GET /network');

  const data = await getNetworksByOrigin(origin);
  req.log.debug({ count: Array.isArray(data) ? data.length : undefined }, 'Networks resolved by origin');

  return sendSuccess(res, data, '');
});

export default router;