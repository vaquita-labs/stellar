import { Router } from 'express';
import {
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

export default router;