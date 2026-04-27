import { Router } from 'express';
import { sendSuccess, supabase } from '@vaquita/shared';

const router = Router();

router.get('/', async (req, res) => {
  
  const networkName = 'Base';
  
  const { data, error } = await supabase
    .from('tenant_config')
    .select('*')
    .eq('network_name', networkName)
    .maybeSingle();
  
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  sendSuccess(res, data, '');
});

router.get('/:networkName', async (req, res) => {
  
  const { networkName } = req.params;
  
  const { data, error } = await supabase
    .from('tenant_config')
    .select('*')
    .eq('network_name', networkName)
    .maybeSingle();
  
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  sendSuccess(res, data, '');
});

export default router;
