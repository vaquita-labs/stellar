import { Router } from 'express';
import { sendError, sendSuccess, supabase } from '@vaquita/shared';

const router = Router();

router.get('/', async (req, res) => {
  const networkName = 'Base';
  req.log.info({ networkName }, 'GET /config (default)');

  const { data, error } = await supabase
    .from('tenant_config')
    .select('*')
    .eq('network_name', networkName)
    .maybeSingle();

  if (error) {
    req.log.error({ err: error, networkName }, 'Failed to fetch tenant_config');
    return sendError(res, error.message, error, 500);
  }

  return sendSuccess(res, data, '');
});

router.get('/:networkName', async (req, res) => {
  const { networkName } = req.params;
  req.log.info({ networkName }, 'GET /config/:networkName');

  const { data, error } = await supabase
    .from('tenant_config')
    .select('*')
    .eq('network_name', networkName)
    .maybeSingle();

  if (error) {
    req.log.error({ err: error, networkName }, 'Failed to fetch tenant_config');
    return sendError(res, error.message, error, 500);
  }

  return sendSuccess(res, data, '');
});

export default router;