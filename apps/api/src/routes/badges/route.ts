import { Router } from 'express';
import {
  getBadgeClaimForNickname,
  sendError,
  sendSuccess,
  toCatalogAchievementByKeyResponseDTO,
  toCatalogAchievementsResponseDTO,
} from '@vaquita/shared';

const router = Router();

/**
 * GET /api/v1/badges
 *
 * Public badge catalog — user-agnostic metadata the web app renders instead of
 * a hardcoded list. Editable from the admin panel via the `achievements` table.
 * No wallet/network context: this is just the catalog (copy, icon, tier, …).
 */
router.get('/', async (req, res) => {
  req.log.info('GET /badges');
  try {
    const achievements = await toCatalogAchievementsResponseDTO();
    return sendSuccess(res, { achievements });
  } catch (err) {
    req.log.error({ err }, 'Failed to load badge catalog');
    return sendError(res, 'Failed to load badge catalog', err, 500);
  }
});

/**
 * GET /api/v1/badges/:key
 *
 * Single badge by key. Resolves `hidden` (redeem-code) badges too — the list
 * endpoint above keeps them unenumerable, which is the property that matters;
 * a lookup by exact key reveals nothing the caller didn't already have. The
 * share/OG card renderer depends on this, so secret badges get downloadable
 * images and link unfurls like any other.
 */
router.get('/:key', async (req, res) => {
  const { key } = req.params;
  req.log.info({ key }, 'GET /badges/:key');
  try {
    const achievement = await toCatalogAchievementByKeyResponseDTO(key);
    if (!achievement) {
      return sendError(res, 'Badge not found', undefined, 404);
    }
    return sendSuccess(res, { achievement });
  } catch (err) {
    req.log.error({ err, key }, 'Failed to load badge');
    return sendError(res, 'Failed to load badge', err, 500);
  }
});

/**
 * GET /api/v1/badges/:key/claim?nickname=<nickname>
 *
 * When that profile claimed that badge, 404 when it never did.
 *
 * The share card prints "earned by @nickname" over an unlock date; both used to
 * be query params the renderer echoed back, so the image could assert a claim
 * that never happened. This is what makes the assertion checkable — the
 * renderer resolves the pair here and takes the date from the row, not from the
 * URL.
 *
 * Deliberately public and unauthenticated, like the rest of the badge surface:
 * it answers about a claim the profile already publishes on its trophy wall and
 * mints on-chain, and the caller has to know both the nickname and the exact
 * badge key to ask.
 */
router.get('/:key/claim', async (req, res) => {
  const { key } = req.params;
  const nickname = typeof req.query.nickname === 'string' ? req.query.nickname.trim() : '';
  req.log.info({ key, nickname }, 'GET /badges/:key/claim');

  if (!nickname) {
    return sendError(res, 'nickname is required', undefined, 400);
  }

  try {
    const claim = await getBadgeClaimForNickname(key, nickname);
    if (!claim) {
      return sendError(res, 'Claim not found', undefined, 404);
    }
    return sendSuccess(res, { claim });
  } catch (err) {
    req.log.error({ err, key, nickname }, 'Failed to resolve badge claim');
    return sendError(res, 'Failed to resolve badge claim', err, 500);
  }
});

export default router;