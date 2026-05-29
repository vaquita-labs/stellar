import { getPrivyData } from '@/helpers/privy';
import { createWalletClient, custom } from 'viem';
import { base, baseSepolia, lisk } from 'viem/chains';

export const getPrivyWalletClient = async (chain: typeof baseSepolia | typeof base | typeof lisk) => {
  const { wallets } = getPrivyData();

  if (!wallets[0]) return null;

  try {
    const provider = await wallets[0].getEthereumProvider();
    return createWalletClient({
      chain,
      transport: custom(provider),
    });
  } catch (error) {
    console.error('Error getting wallet client:', error);
    return null;
  }
};

export const isNewDepositHandled = (networkName: string) => {
  return false;
};
