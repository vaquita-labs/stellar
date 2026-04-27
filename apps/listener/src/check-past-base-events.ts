import { getPastEventsBaseSepolia } from './listeners/base-spolia';

// getPastEventsBaseSepolia('https://sepolia.base.org', 'USDC').then(() => {
//   console.info('END startListeningBaseSepolia(https://sepolia.base.org, USDC)');
// });

const providerUrl = 'https://mainnet.base.org';
getPastEventsBaseSepolia(60, providerUrl, 'USDC').then(() => {
  console.info(`END startListeningBaseSepolia(${providerUrl}, USDC)`);
});

// getPastEventsBaseSepolia(10, 'https://sepolia.base.org', 'USDT').then(() => {
//   console.info('END startListeningBaseSepolia(https://sepolia.base.org, USDT)');
// });
