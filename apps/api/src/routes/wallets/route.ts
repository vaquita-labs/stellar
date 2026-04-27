import { Router } from 'express';
import { sendSuccess, supabase } from '@vaquita/shared';

const router = Router();

// DEPRECATED
router.get('', async (req, res) => {
  
  const { data, error } = await supabase
    .from('wallets')
    .select('*');
  
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  sendSuccess(res, data, '');
});

router.get('/with-deposits', async (req, res) => {
  
  const { data, error } = await supabase
    .from('wallets')
    .select('*');
  
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  sendSuccess(res, data, '');
});

export default router;
