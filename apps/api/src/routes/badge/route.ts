import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import { getBadgeMetadata } from '@vaquita/shared';

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
// GET /api/v1/badge/:tokenId
// ---------------------------------------------------------------------------

/**
 * Returns NFT JSON metadata for a minted badge token.
 *
 * 200 — valid NFT metadata object
 * 400 — token_id is not a non-negative integer
 * 404 — token has not been minted
 * 503 — badge contract ID not configured
 */
router.get(
  '/:tokenId',
  asyncHandler(async (req, res) => {
    const { tokenId } = req.params;

    const tokenIdNum = Number(tokenId);
    if (!Number.isInteger(tokenIdNum) || tokenIdNum < 0) {
      return res.status(400).json({ status: 'error', message: 'token_id must be a non-negative integer' });
    }

    const contractId = process.env.BADGE_CONTRACT_ID;
    if (!contractId) {
      req.log.error('BADGE_CONTRACT_ID env var not set');
      return res.status(503).json({ status: 'error', message: 'Badge contract not configured' });
    }

    req.log.info({ tokenId: tokenIdNum }, 'GET /badge/:tokenId');

    const metadata = await getBadgeMetadata(contractId, tokenIdNum);
    if (!metadata) {
      return res.status(404).json({ status: 'error', message: 'Token not found' });
    }

    return res.json(metadata);
  }),
);

export default router;
