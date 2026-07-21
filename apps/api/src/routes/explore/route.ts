import { Router } from 'express';
import {
  EXPLORE_DEFAULT_PAGE_SIZE,
  EXPLORE_MAX_PAGE_SIZE,
  getExploreFeed,
  getNetworkName,
  sendError,
  sendSuccess,
} from '@vaquita/shared';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/explore/wallet/:walletAddress?seed=&limit=&offset=
// ---------------------------------------------------------------------------

/**
 * One page of the discovery feed: other vaqueros to look at and follow, in a
 * shuffled order. Not a ranking — no positions, no score, nothing sorted by XP.
 *
 * The viewer and everyone they already follow are excluded server-side, so
 * every page comes back full of people the viewer hasn't added yet.
 *
 * `seed` makes the shuffle stable: the client generates one per browsing
 * session and sends it with every page, so scrolling never repeats or skips a
 * profile the way `ORDER BY random()` per request would. A fresh visit gets a
 * fresh seed and therefore a fresh order.
 *
 * 200 { rows: [ { walletAddress, nickname, avatarUrl, badges, streak, experience } ],
 *       total, limit, offset, hasMore, networkName }
 */
router.get('/wallet/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;
  const seed = String(req.query?.seed ?? '').trim() || 'default';
  const limitRaw = Number(req.query?.limit);
  const offsetRaw = Number(req.query?.offset);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), EXPLORE_MAX_PAGE_SIZE)
      : EXPLORE_DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  req.log.info({ walletAddress, seed, limit, offset }, 'GET /explore/wallet/:walletAddress');

  try {
    const page = await getExploreFeed({ viewerWallet: walletAddress, seed, limit, offset });
    return sendSuccess(res, { ...page, networkName: await getNetworkName() }, '');
  } catch (err: any) {
    req.log.error({ err, walletAddress }, 'Explore feed query failed');
    return sendError(res, err?.message ?? 'Explore feed query failed', err, 500);
  }
});

export default router;
