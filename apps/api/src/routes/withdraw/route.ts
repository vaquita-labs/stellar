import { Router } from 'express';
import { depositSchema, sendError, sendSuccess, supabase } from '@vaquita/shared';

const router = Router();

// TODO: fix & validate
router.post('/', async (req, res) => {
  
  const { data, success, error } = depositSchema.safeParse(req.body);
  
  if (!success) {
    return sendError(res, 'Payload inválido', error);
  }
  
  const { data: userWallet } = await supabase
    .from('wallets')
    .select('id')
    .eq('wallet_address', data!.walletAddress)
    .eq('network_name', data!.networkName)
    .maybeSingle();
  
  if (!userWallet) {
    const result = await supabase
      .from('wallets')
      .insert([
        {
          wallet_address: data!.walletAddress,
          network_name: data!.networkName,
        },
      ]);
    console.info('new wallet inserted', result);
  }
  
  const newDeposit = {
    amount: data!.amount,
    network_name: data!.networkName,
    wallet_address: data!.walletAddress,
    asset_code: data!.tokenSymbol,
  };
  
  const result = await supabase
    .from('deposits')
    .insert([ newDeposit ])
    .select()
    .maybeSingle();
  console.info('deposit inserted', result);
  
  if (result.error) {
    console.error('Error insertando deposit:', result.error.message);
  }
  
  return sendSuccess(res, result.data, 'success inserted');
});

router.post('/confirm', async (req, res) => {
  
  const { id, txHash } = req.body;
  
  const result = await supabase
    .from('wallets')
    .update({ status: 'confirmed', tx_hash: txHash })
    .eq('id', id)
    .maybeSingle();
  
  console.info('deposit confirmed', result);
  
  if (result.error) {
    console.error('Error insertando deposit:', result.error.message);
  }
  
  return sendSuccess(res, true, 'success confirmed');
});

router.get('/network/:networkName/wallet/:walletAddress', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .eq('network_name', networkName)
    .eq('wallet_address', walletAddress);
  
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  sendSuccess(res, data, '');
});

export default router;
