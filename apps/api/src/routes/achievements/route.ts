import { Router } from 'express';
import { sendError, sendSuccess, toCatalogAchievementsResponseDTO } from '@vaquita/shared';

const router = Router();

/**
 * Public badge catalog — user-agnostic metadata the web app renders instead of
 * a hardcoded list. Editable from the admin panel via the `achievements` table.
 * No wallet/network context: this is just the catalog (copy, icon, tier, …).
 */
router.get('/catalog', async (req, res) => {
  req.log.info('GET /achievements/catalog');
  try {
    const achievements = await toCatalogAchievementsResponseDTO();
    return sendSuccess(res, { achievements });
  } catch (err) {
    req.log.error({ err }, 'Failed to load achievements catalog');
    return sendError(res, 'Failed to load achievements catalog', err, 500);
  }
});

export default router;
