import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import {
  DEFAULT_BUCKETS,
  EARNINGS_PERIODS,
  type EarningsPeriod,
  getNetworkByName,
  getPassiveEarnings,
  getTokenBySymbol,
  isValidTimeZone,
  MAX_BUCKETS,
  sendError,
  sendSuccess,
} from '@vaquita/shared';

/**
 * What a wallet's flexible savings earned (`/earnings`), per calendar bucket in
 * the user's time zone. Read-only and public by wallet, like the deposits: the
 * figures derive from an on-chain balance anyone can read.
 */
const router = Router();

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

const asyncHandler =
  <P = unknown, Q = unknown>(
    fn: (req: Request<P, unknown, unknown, Q>, res: Response, next: NextFunction) => Promise<unknown>,
  ): RequestHandler<P, unknown, unknown, Q> =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      req.log.error({ err }, 'Unhandled error in earnings route handler');
      next(err);
    }
  };

router.get(
  '/network/:networkName/wallet/:walletAddress',
  asyncHandler<
    { networkName: string; walletAddress: string },
    { period?: string; count?: string; tz?: string; token?: string }
  >(async (req, res) => {
    const { networkName, walletAddress } = req.params;
    if (!STELLAR_ADDRESS.test(walletAddress)) return sendError(res, 'Invalid wallet address', undefined, 400);

    const period = (req.query.period ?? 'daily') as EarningsPeriod;
    if (!EARNINGS_PERIODS.includes(period)) return sendError(res, 'Invalid period', undefined, 400);

    const count = req.query.count === undefined ? DEFAULT_BUCKETS[period] : Number(req.query.count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_BUCKETS) return sendError(res, 'Invalid count', undefined, 400);

    const timeZone = req.query.tz ?? 'UTC';
    if (!isValidTimeZone(timeZone)) return sendError(res, 'Invalid time zone', undefined, 400);

    const { data: network, error: networkError } = await getNetworkByName(networkName);
    if (networkError || !network) return sendError(res, 'Network not found', networkError, 404);

    const { data: token, error: tokenError } = await getTokenBySymbol(req.query.token ?? 'USDC');
    if (tokenError || !token) return sendError(res, 'Token not found', tokenError, 404);

    const earnings = await getPassiveEarnings({ walletAddress, tokenId: token.id, period, count, timeZone });
    return sendSuccess(res, earnings);
  }),
);

export default router;
