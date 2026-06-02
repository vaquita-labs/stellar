import { Router } from 'express';
import { getProjectConfig, sendError, sendSuccess } from '@vaquita/shared';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/config
// ---------------------------------------------------------------------------

/**
 * Returns the single project configuration (name, type, networkPassphrase,
 * badgesContractAddress, tokens[]). Single-network: there is exactly one config.
 *
 * 200 { name, type, networkPassphrase, badgesContractAddress?, tokens: [...] }
 * 404 config not found (project_config table empty)
 */
router.get('/', async (req, res) => {
  req.log.info('GET /config');

  try {
    const config = await getProjectConfig();
    if (!config) {
      return sendError(res, 'project config not found', null, 404);
    }
    return sendSuccess(res, config, '');
  } catch (err: any) {
    req.log.error({ err }, 'Failed to fetch project config');
    return sendError(res, err?.message ?? 'Failed to fetch project config', err, 500);
  }
});

export default router;
