import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import { closeLeaderboardCycle, getNetworkByName } from '@vaquita/shared';

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

function requireAdminSecret(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true; // not configured — open (dev only)
  const provided = req.headers['x-admin-secret'] as string | undefined;
  if (provided !== secret) {
    res.status(403).json({ status: 'error', message: 'Forbidden' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/v1/admin/leaderboard/close
// ---------------------------------------------------------------------------

/**
 * Closes a leaderboard cycle: ranks top 10, issues signed claims.
 * Body: { network_name: string, cycle_id: number }
 *
 * 200 OK
 * 400 missing params
 * 403 invalid admin secret
 * 404 unknown network
 */
router.post(
  '/leaderboard/close',
  asyncHandler(async (req, res) => {
    if (!requireAdminSecret(req, res)) return;

    const { network_name: networkName, cycle_id: cycleIdRaw } = req.body as {
      network_name?: string;
      cycle_id?: unknown;
    };

    if (!networkName || cycleIdRaw == null) {
      return res.status(400).json({ status: 'error', message: 'Missing network_name or cycle_id' });
    }

    const cycleId = Number(cycleIdRaw);
    if (!Number.isInteger(cycleId) || cycleId < 100000) {
      return res.status(400).json({ status: 'error', message: 'cycle_id must be a valid YYYYMM integer' });
    }

    const { data: network, error } = await getNetworkByName(networkName);
    if (error || !network) {
      return res.status(404).json({ status: 'error', message: 'Network not found' });
    }

    req.log.info({ networkName, cycleId }, 'POST /admin/leaderboard/close');

    await closeLeaderboardCycle(cycleId, network.id as number);

    return res.json({ status: 'success', message: `Cycle ${cycleId} closed for ${networkName}` });
  }),
);

export default router;
