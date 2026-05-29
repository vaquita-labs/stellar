import { NetworkResponseDTO } from '@/core-ui/types';

export type TokenSymbol = 'USDC' | 'ETH' | 'BTC' | 'USDT';

export interface MoneyInputProps {
  loading?: boolean;
  value: string; // mantener como string para precisión
  onValueChange: (v: string) => void;
  tokenSymbol: TokenSymbol;
  onTokenChange: (t: NetworkResponseDTO['tokens'][0]) => void;
  cap?: number;
  balanceFormatted?: string;
  onReloadBalance?: () => void;
  balanceIsLoading: boolean;
}
