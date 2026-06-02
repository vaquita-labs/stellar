import { Router } from 'express';
import { getBalances, getNetworksByOrigin, sendError, sendSuccess } from '@vaquita/shared';

const router = Router();

router.get('/balance/wallet/:wallet_address', async (req, res) => {
  const { wallet_address: walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /user/balance/wallet/:wallet_address');

  try {
    const networks = await getNetworksByOrigin(req.get('origin') || '');
    const balances = await getBalances(walletAddress, networks);
    return sendSuccess(res, { balances, wallet: { walletAddress } }, '');
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to fetch wallet balance');
    return sendError(res, 'Error fetching balance', err, 500);
  }
});

export default router;
