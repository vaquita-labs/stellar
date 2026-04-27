import { Router } from 'express';
import { getNetworkByName, getNetworksByOrigin, sendError, sendSuccess, toNetwork } from '@vaquita/shared';

const router = Router();

router.get('/:networkName', async (req, res) => {
  const { networkName } = req.params;
  req.log.info({ networkName }, 'GET /network/:networkName');

  const { data: network, error } = await getNetworkByName(networkName);

  if (error || !network) {
    req.log.error({ err: error, networkName }, 'Network not found');
    return sendError(res, error?.message || 'network not found', error, 404);
  }

  return sendSuccess(res, await toNetwork(network), '');
});

router.get('/', async (req, res) => {
  const origin = req.get('origin') || '';
  req.log.info({ origin }, 'GET /network');

  const data = await getNetworksByOrigin(origin);
  req.log.debug({ count: Array.isArray(data) ? data.length : undefined }, 'Networks resolved by origin');

  return sendSuccess(res, data, '');
});

export default router;