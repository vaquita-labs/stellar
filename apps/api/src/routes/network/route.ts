import { Router } from 'express';
import { getNetworkByName, getNetworksByOrigin, sendSuccess, toNetwork } from '@vaquita/shared';

const router = Router();

router.get('/:networkName', async (req, res) => {
  
  const { networkName } = req.params;
  
  const { data: network, error } = await getNetworkByName(networkName);
  
  if (error || !network) {
    return res.status(500).json({ error: error?.message || 'network not found :(' });
  }
  
  sendSuccess(res, await toNetwork(network), '');
});

router.get('/', async (req, res) => {
  
  const data = await getNetworksByOrigin(req.get('origin') || '');
  
  sendSuccess(res, data, '');
});

export default router;
