import { Router } from 'express';
import { depositSchema, sendError, sendSuccess, supabase } from '@vaquita/shared';

const router = Router();

// TODO: fix & validate
router.post('/', async (req, res) => {
  req.log.info('POST /withdraw');

  const { data, success, error } = depositSchema.safeParse(req.body);

  if (!success || !data) {
    req.log.warn({ err: error?.format?.() ?? error }, 'Invalid withdraw payload');
    return sendError(res, 'Payload inválido', error, 400);
  }

  const childLog = req.log.child({
    walletAddress: data.walletAddress,
    networkName: data.networkName,
    tokenSymbol: data.tokenSymbol,
  });

  const { data: userWallet, error: walletLookupError } = await supabase
    .from('wallets')
    .select('id')
    .eq('wallet_address', data.walletAddress)
    .eq('network_name', data.networkName)
    .maybeSingle();

  if (walletLookupError) {
    childLog.error({ err: walletLookupError }, 'Failed to lookup wallet');
    return sendError(res, 'Failed to lookup wallet', walletLookupError, 500);
  }

  if (!userWallet) {
    const insertWalletResult = await supabase
      .from('wallets')
      .insert([
        {
          wallet_address: data.walletAddress,
          network_name: data.networkName,
        },
      ]);

    if (insertWalletResult.error) {
      childLog.error({ err: insertWalletResult.error }, 'Failed to insert wallet');
      return sendError(res, 'Failed to insert wallet', insertWalletResult.error, 500);
    }
    childLog.info('New wallet inserted');
  }

  const newDeposit = {
    amount: data.amount,
    network_name: data.networkName,
    wallet_address: data.walletAddress,
    asset_code: data.tokenSymbol,
  };

  const result = await supabase
    .from('deposits')
    .insert([ newDeposit ])
    .select()
    .maybeSingle();

  if (result.error) {
    childLog.error({ err: result.error, deposit: newDeposit }, 'Failed to insert deposit');
    return sendError(res, 'Failed to insert deposit', result.error, 500);
  }

  childLog.info({ depositId: result.data?.id }, 'Deposit inserted');
  return sendSuccess(res, result.data, 'success inserted');
});

router.post('/confirm', async (req, res) => {
  const { id, txHash } = req.body;
  req.log.info({ id, txHash }, 'POST /withdraw/confirm');

  if (!id || !txHash) {
    req.log.warn({ id, txHash }, 'Missing id or txHash');
    return sendError(res, 'Missing id or txHash', null, 400);
  }

  const result = await supabase
    .from('wallets')
    .update({ status: 'confirmed', tx_hash: txHash })
    .eq('id', id)
    .maybeSingle();

  if (result.error) {
    req.log.error({ err: result.error, id, txHash }, 'Failed to confirm withdraw');
    return sendError(res, 'Failed to confirm withdraw', result.error, 500);
  }

  req.log.info({ id, txHash }, 'Withdraw confirmed');
  return sendSuccess(res, true, 'success confirmed');
});

router.get('/network/:networkName/wallet/:walletAddress', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /withdraw/network/:networkName/wallet/:walletAddress');

  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .eq('network_name', networkName)
    .eq('wallet_address', walletAddress);

  if (error) {
    req.log.error({ err: error, networkName, walletAddress }, 'Failed to list withdraws');
    return sendError(res, error.message, error, 500);
  }

  return sendSuccess(res, data, '');
});

export default router;