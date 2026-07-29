'use client';

import { useTranslation } from 'react-i18next';
import { isPassiveVaultEnabled } from '@/core-ui/config/featureFlags';
import { useDefindexVaultPosition } from '@/core-ui/hooks/useDefindexVaultPosition';
import { useConfigStore } from '@/core-ui/stores';
import { defindexVaultConfigForToken } from '@/networks/stellar/vaultQueries';

/**
 * Minimal passive-vault balance row: the DeFindex vault position read on-chain
 * (issue 070's demoable surface). Dark by default — renders nothing unless the
 * rollout flag is on AND the active token has a DeFindex vault configured, so it
 * never shows in prod until the passive-vault feature is switched on. Live
 * ticking + APY come later (issue 073).
 */
export function VaultBalanceRow({ walletAddress }: { walletAddress?: string }) {
  const { t } = useTranslation();
  const token = useConfigStore((s) => s.token);
  const { data } = useDefindexVaultPosition(walletAddress);

  if (!isPassiveVaultEnabled() || !defindexVaultConfigForToken(token)) return null;

  const usdc = data?.usdc ?? 0;
  return (
    <div
      data-testid="vault-balance-row"
      className="flex items-center justify-between border-t border-black/[0.07] first:border-t-0 py-3"
    >
      <span className="text-sm font-medium">{t('portfolio.vault', 'Vault')}</span>
      <span className="text-sm tabular-nums">
        {usdc.toLocaleString(undefined, { maximumFractionDigits: 7 })} {token?.symbol ?? 'USDC'}
      </span>
    </div>
  );
}
