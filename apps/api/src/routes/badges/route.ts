import { Router } from 'express';
import { sendError, sendSuccess, toCatalogAchievementsResponseDTO } from '@vaquita/shared';

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

export default router;