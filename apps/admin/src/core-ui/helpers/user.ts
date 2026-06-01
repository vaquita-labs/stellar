import { NetworkResponseDTO, UserBalanceResponseDTO } from '@/core-ui/types';

export const getBalance = (
  network: NetworkResponseDTO | null,
  token: NetworkResponseDTO['tokens'][number] | null,
  balances: UserBalanceResponseDTO['balances']
) => {
  return balances?.find((balance) => balance.tokenSymbol === token?.symbol && balance.networkName === network?.name);
};

export const getQuickAmounts = (tokenSymbols: string) => {
  const tokens = [
    { symbol: 'ETH', prices: [0.01, 0.05] },
    { symbol: 'USDC', prices: [10, 20] },
    { symbol: 'BTC', prices: [0.0002, 0.0005] },
  ];
  const token = tokens.find((token) => token.symbol === tokenSymbols);
  return token?.prices;
};
