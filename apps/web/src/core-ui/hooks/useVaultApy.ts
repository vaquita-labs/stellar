import { clientEnv } from '@/core-ui/config/clientEnv';
import { ONE_MINUTE } from '@/core-ui/config/constants';
import { useQuery } from '@tanstack/react-query';
import { useConfigStore } from '../stores';

export type VaultApyData = {
  /** The vault's own APY, in percent (0 when it has not accrued measurably). */
  protocolApy: number;
  /** Market behind the rate; empty when no rate came back. */
  lendingMarketName: string;
};

const EMPTY: VaultApyData = { protocolApy: 0, lendingMarketName: '' };

/**
 * The flexible position's rate, read from the DeFindex vault the funds actually
 * sit in. The API owns the lookup because it holds the DeFindex credentials.
 *
 * Deliberately not Blend's supply APY: the vault takes a fee and runs its own
 * strategy, so Blend's rate over-states what this position earns. A vault that
 * has not accrued measurably yet reports 0, and 0 is what gets shown — a number
 * the balance will actually match beats a flattering one it will not.
 */
export const useVaultApy = () => {
  const { network, token } = useConfigStore();
  const networkName = network?.networkName;
  const tokenSymbol = token?.symbol;

  return useQuery<VaultApyData>({
    queryKey: ['deposit', 'network', networkName, 'token', tokenSymbol, 'vault', 'apy'],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/network/${networkName}/token/${tokenSymbol}/vault/apy`,
        );
        const data = await response.json();
        return {
          protocolApy: data?.data?.protocolApy ?? 0,
          lendingMarketName: data?.data?.lendingMarketName ?? '',
        };
      } catch (error) {
        console.error('useVaultApy', error);
        return EMPTY;
      }
    },
    refetchInterval: ONE_MINUTE * 5,
    enabled: !!networkName && !!tokenSymbol,
  });
};
