import { PrivyClient } from '@privy-io/server-auth';
import { ethers } from 'ethers';
import { Router } from 'express';
import { getBalances, getNetworksByOrigin, sendError, sendSuccess } from '@vaquita/shared';

const router = Router();

const privy = new PrivyClient(process.env.PRIVY_APP_ID!, process.env.PRIVY_APP_SECRET!);

router.get('/privy', async (req, res) => {
  try {
    const data = [];
    for (const user of await privy.getUsers()) {
      data.push({
        ...user,
        // balance: await getBalances(user?.wallet?.address ?? ''),
      });
    }
    sendSuccess(res, data, '');
  } catch (err) {
    sendError(res, 'Error listing users', err);
  }
});

router.get('/balance/wallet/:wallet_address', async (req, res) => {
  const { wallet_address } = req.params;
  try {
    const walletAddress = wallet_address;
    const networks = await getNetworksByOrigin(req.get('origin') || '');
    const balances = await getBalances(walletAddress, networks);
    sendSuccess(res, { balances, wallet: { walletAddress } }, '');
  } catch (err) {
    sendError(res, 'Error listing users', err);
  }
});

router.get('/balance-server', async (req, res) => {
  try {
    const walletAddress = '0x4693503438eF4e099C76ff6F51CF11b9C534df1A';
    const networks = await getNetworksByOrigin(req.get('origin') || '');
    const balances = await getBalances(walletAddress, networks);
    sendSuccess(res, { balances, wallet: { walletAddress } }, '');
  } catch (err) {
    sendError(res, 'Error listing users', err);
  }
});

const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY;
const baseSepoliaProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
const serverWallet = SERVER_PRIVATE_KEY ? new ethers.Wallet(SERVER_PRIVATE_KEY, baseSepoliaProvider) : null;

const ERC20_ABI = [
  'function transfer(address to, uint amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

router.post('/fund/network/base-sepolia/token/eth', async (req, res) => {
  try {
    if (!serverWallet) return sendError(res, 'Server wallet not configured', null, 500);
    
    const { to, amount } = req.body;
    if (!to) return sendError(res, 'Missing "to" address', null, 400);
    if (!ethers.isAddress(to)) return sendError(res, 'Invalid address', null, 400);
    
    const tx = await serverWallet.sendTransaction({
      to,
      value: ethers.parseEther(amount.toFixed(9)),
    });
    
    const receipt = await tx.wait(1);
    sendSuccess(res, { txHash: tx.hash, receipt }, 'ETH sent');
  } catch (err) {
    console.error('Error funding ETH:', err);
    sendError(res, 'Error funding ETH', err);
  }
});

router.post('/fund/network/base-sepolia/token/usdc', async (req, res) => {
  const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  try {
    if (!serverWallet) return sendError(res, 'Server wallet not configured', null, 500);
    
    const { to, amount } = req.body;
    if (!to || !amount) return sendError(res, 'Missing "to" or "amount"', null, 400);
    if (!ethers.isAddress(to)) return sendError(res, 'Invalid address', null, 400);
    
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, serverWallet);
    
    const tx = await usdc.transfer?.(to, BigInt(amount));
    const receipt = await tx.wait(1);
    
    sendSuccess(res, { txHash: tx.hash, receipt }, 'USDC sent');
  } catch (err) {
    console.error('Error funding USDC:', err);
    sendError(res, 'Error funding USDC', err);
  }
});

export default router;
