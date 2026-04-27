import { PrivyClient } from '@privy-io/server-auth';
import { ethers } from 'ethers';
import { Router } from 'express';
import { getBalances, getNetworksByOrigin, sendError, sendSuccess } from '@vaquita/shared';
import { logger } from '../../lib/logger';

const router = Router();

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  logger.warn('PRIVY_APP_ID/PRIVY_APP_SECRET no configurados, /user/privy fallará');
}

const privy = PRIVY_APP_ID && PRIVY_APP_SECRET
  ? new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET)
  : null;

router.get('/privy', async (req, res) => {
  req.log.info('GET /user/privy');

  if (!privy) {
    req.log.error('Privy client not configured');
    return sendError(res, 'Privy not configured', null, 500);
  }

  try {
    const users = await privy.getUsers();
    const data = users.map((user) => ({ ...user }));
    req.log.debug({ count: data.length }, 'Privy users fetched');
    return sendSuccess(res, data, '');
  } catch (err) {
    req.log.error({ err }, 'Failed to list Privy users');
    return sendError(res, 'Error listing users', err, 500);
  }
});

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

router.get('/balance-server', async (req, res) => {
  const walletAddress = '0x4693503438eF4e099C76ff6F51CF11b9C534df1A';
  req.log.info({ walletAddress }, 'GET /user/balance-server');

  try {
    const networks = await getNetworksByOrigin(req.get('origin') || '');
    const balances = await getBalances(walletAddress, networks);
    return sendSuccess(res, { balances, wallet: { walletAddress } }, '');
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to fetch server balance');
    return sendError(res, 'Error fetching server balance', err, 500);
  }
});

const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY;
const baseSepoliaProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
const serverWallet = SERVER_PRIVATE_KEY ? new ethers.Wallet(SERVER_PRIVATE_KEY, baseSepoliaProvider) : null;

if (!serverWallet) {
  logger.warn('SERVER_PRIVATE_KEY no configurada, endpoints /user/fund/* devolverán 500');
}

const ERC20_ABI = [
  'function transfer(address to, uint amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

router.post('/fund/network/base-sepolia/token/eth', async (req, res) => {
  const { to, amount } = req.body ?? {};
  req.log.info({ to, amount }, 'POST /user/fund/.../eth');

  if (!serverWallet) {
    req.log.error('Server wallet not configured');
    return sendError(res, 'Server wallet not configured', null, 500);
  }
  if (!to) return sendError(res, 'Missing "to" address', null, 400);
  if (!ethers.isAddress(to)) {
    req.log.warn({ to }, 'Invalid recipient address');
    return sendError(res, 'Invalid address', null, 400);
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    req.log.warn({ amount }, 'Invalid amount');
    return sendError(res, 'Invalid amount', null, 400);
  }

  try {
    const tx = await serverWallet.sendTransaction({
      to,
      value: ethers.parseEther(amount.toFixed(9)),
    });
    req.log.info({ to, amount, txHash: tx.hash }, 'ETH funding tx sent');

    const receipt = await tx.wait(1);
    req.log.info({ to, txHash: tx.hash, blockNumber: receipt?.blockNumber }, 'ETH funding tx confirmed');

    return sendSuccess(res, { txHash: tx.hash, receipt }, 'ETH sent');
  } catch (err) {
    req.log.error({ err, to, amount }, 'Failed to fund ETH');
    return sendError(res, 'Error funding ETH', err, 500);
  }
});

router.post('/fund/network/base-sepolia/token/usdc', async (req, res) => {
  const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  const { to, amount } = req.body ?? {};
  req.log.info({ to, amount }, 'POST /user/fund/.../usdc');

  if (!serverWallet) {
    req.log.error('Server wallet not configured');
    return sendError(res, 'Server wallet not configured', null, 500);
  }
  if (!to || amount === undefined || amount === null) {
    return sendError(res, 'Missing "to" or "amount"', null, 400);
  }
  if (!ethers.isAddress(to)) {
    req.log.warn({ to }, 'Invalid recipient address');
    return sendError(res, 'Invalid address', null, 400);
  }

  try {
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, serverWallet);
    const tx = await usdc.transfer?.(to, BigInt(amount));

    if (!tx) {
      req.log.error({ to, amount }, 'USDC transfer returned no tx');
      return sendError(res, 'USDC transfer failed', null, 500);
    }

    req.log.info({ to, amount, txHash: tx.hash }, 'USDC funding tx sent');
    const receipt = await tx.wait(1);
    req.log.info({ to, txHash: tx.hash, blockNumber: receipt?.blockNumber }, 'USDC funding tx confirmed');

    return sendSuccess(res, { txHash: tx.hash, receipt }, 'USDC sent');
  } catch (err) {
    req.log.error({ err, to, amount }, 'Failed to fund USDC');
    return sendError(res, 'Error funding USDC', err, 500);
  }
});

export default router;