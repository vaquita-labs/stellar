import { startListeningBaseSepolia } from './listeners/base-spolia';

const providerUrl = 'https://sepolia.base.org';

startListeningBaseSepolia(providerUrl, 'Base Sepolia Testnet').then(() => {
  console.info('END startListeningBaseSepolia (https://sepolia.base.org, USDC)');
});

const baseMainnetProviderUrl = process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org';
startListeningBaseSepolia(baseMainnetProviderUrl, 'Base').then(() => {
  console.info(`END startListeningBaseMainnet (${baseMainnetProviderUrl}, USDC)`);
});
