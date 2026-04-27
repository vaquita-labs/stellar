import { Router } from 'express';
import { sendError, sendSuccess, supabase } from '@vaquita/shared';

const router = Router();

// DEPRECATED
router.get('', async (req, res) => {
  req.log.warn('GET /wallets (deprecated endpoint)');

  const { data, error } = await supabase
    .from('wallets')
    .select('*');

  if (error) {
    req.log.error({ err: error }, 'Failed to list wallets');
    return sendError(res, error.message, error, 500);
  }

  return sendSuccess(res, data, '');
});

router.get('/with-deposits', async (req, res) => {
  req.log.info('GET /wallets/with-deposits');

  const { data, error } = await supabase
    .from('wallets')
    .select('*');

  if (error) {
    req.log.error({ err: error }, 'Failed to list wallets with deposits');
    return sendError(res, error.message, error, 500);
  }

  return sendSuccess(res, data, '');
});

export default router;