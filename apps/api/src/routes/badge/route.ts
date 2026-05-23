import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import { getBadgeMetadata, getNetworkByName } from '@vaquita/shared';

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
// GET /api/v1/badge/:networkName/:tokenId
// ---------------------------------------------------------------------------

/**
 * Returns NFT JSON metadata for a minted badge token.
 *
 * 200 — valid NFT metadata object
 * 400 — token_id is not a non-negative integer
 * 404 — token has not been minted or network not found
 * 503 — badges_contract_address not set for this network
 */
router.get(
  '/:networkName/:tokenId',
  asyncHandler(async (req, res) => {
    const { networkName, tokenId } = req.params;

    const tokenIdNum = Number(tokenId);
    if (!Number.isInteger(tokenIdNum) || tokenIdNum < 0) {
      return res.status(400).json({ status: 'error', message: 'token_id must be a non-negative integer' });
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

    req.log.info({ networkName, tokenId: tokenIdNum }, 'GET /badge/:networkName/:tokenId');

    const metadata = await getBadgeMetadata(contractId, tokenIdNum);
    if (!metadata) {
      return res.status(404).json({ status: 'error', message: 'Token not found' });
    }

    return res.json(metadata);
  }),
);

export default router;
