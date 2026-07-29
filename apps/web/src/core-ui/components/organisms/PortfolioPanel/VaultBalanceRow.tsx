'use client';

import { useTranslation } from 'react-i18next';
import { isPassiveVaultEnabled } from '@/core-ui/config/featureFlags';
import { useLiveVaultUsdc } from '@/core-ui/hooks/useDefindexVaultPosition';
import { useConfigStore } from '@/core-ui/stores';
import { defindexVaultConfigForToken } from '@/networks/stellar/vaultQueries';

/**
 * Passive-vault balance row: the DeFindex vault position read on-chain and
 * projected live. The USDC balance ticks with the shared timer (snapping to the
 * real read every refetch), and the rate shown is the underlying Blend supply APY
 * (spec §7), not the vault's net APY.
 *
 * Dark by default — renders nothing unless the rollout flag is on AND the active
 * token has a DeFindex vault configured, so it never shows in prod until the
 * passive-vault feature is switched on. The live/ticking hook lives in the inner
 * component so it only mounts (and re-renders ~4x/sec) when the row is shown.
 */
export function VaultBalanceRow({ walletAddress }: { walletAddress?: string }) {
  const token = useConfigStore((s) => s.token);
  if (!isPassiveVaultEnabled() || !defindexVaultConfigForToken(token)) return null;
  return <VaultBalanceRowInner walletAddress={walletAddress} />;
}

function VaultBalanceRowInner({ walletAddress }: { walletAddress?: string }) {
  const { t } = useTranslation();
  const token = useConfigStore((s) => s.token);
  const { live, apy } = useLiveVaultUsdc(walletAddress);

  return (
    <div
      data-testid="vault-balance-row"
      className="flex items-center justify-between border-t border-black/[0.07] first:border-t-0 py-3"
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium">{t('portfolio.vault', 'Vault')}</span>
        <span className="text-xs text-gray-500 tabular-nums">
          {apy.toLocaleString(undefined, { maximumFractionDigits: 2 })}% APY
        </span>
      </div>
      <span className="text-sm tabular-nums">
        {live.toLocaleString(undefined, { maximumFractionDigits: 7 })} {token?.symbol ?? 'USDC'}
      </span>
    </div>
  );
}
