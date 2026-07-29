import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { isPassiveVaultEnabled } from '@/core-ui/config/featureFlags';
import { useConfigStore } from '@/core-ui/stores';
import { directBlendWithdraw, getBlendUsdcBalance } from '@/networks/stellar/blendDirect';
import { vaultDeposit } from '@/networks/stellar/vaultDirect';
import { defindexVaultConfigForToken } from '@/networks/stellar/vaultQueries';
import { useBlendPosition } from './useBlendPosition';

/**
 * All-or-nothing migration of a legacy direct-to-Blend position into the DeFindex
 * vault. Self-derived from the LIVE Blend collateral (read each render), so it's
 * resumable with no stored state: once the Blend collateral hits 0 the migration
 * is no longer needed and the blocking UI disappears — a user who withdrew but
 * bailed before depositing just resumes at a normal vault deposit (funds already
 * in wallet).
 *
 * Both actions withdraw the ENTIRE Blend position (no partial). A borrow against
 * that collateral makes a full withdraw impossible (Blend health check), so
 * `hasBorrow` blocks both branches until the user repays.
 */
export const usePassiveMigration = (walletAddress?: string) => {
  const token = useConfigStore((s) => s.token);
  const queryClient = useQueryClient();
  const blend = useBlendPosition(walletAddress);

  const decimals = token?.decimals ?? 7;
  const blendBalance = blend.data?.usdc ?? 0;
  const hasBorrow = (blend.data?.borrow ?? 0) > 0;
  const vaultConfigured = !!defindexVaultConfigForToken(token);
  const needsMigration =
    isPassiveVaultEnabled() && vaultConfigured && !!walletAddress && blendBalance > 0;

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
    void queryClient.invalidateQueries({ queryKey: ['defindex-vault-position'] });
  }, [queryClient]);

  /**
   * Withdraw the whole Blend position, then deposit the received USDC (plus any
   * `chosenNewAmount` the user is adding) into the vault. Two non-atomic txs; if
   * the deposit is interrupted, the withdrawn funds are safe in the wallet and the
   * user resumes at a normal deposit. Only the received + chosen amount is
   * deposited — the rest of the wallet is never swept.
   */
  const migrateToVault = useCallback(
    async (chosenNewAmount = 0) => {
      if (!walletAddress || !token) throw new Error('Wallet or token not ready');
      const factor = 10 ** decimals;

      const walletBefore = await getBlendUsdcBalance(walletAddress, decimals);
      await directBlendWithdraw({ address: walletAddress, amount: '0', decimals, withdrawAll: true });
      const walletAfter = await getBlendUsdcBalance(walletAddress, decimals);

      const receivedBase = Math.max(0, Math.floor((walletAfter - walletBefore) * factor));
      const depositBase = receivedBase + Math.max(0, Math.floor(chosenNewAmount * factor));
      if (depositBase > 0) {
        await vaultDeposit({
          address: walletAddress,
          amount: (depositBase / factor).toFixed(decimals),
          decimals,
        });
      }
      refresh();
    },
    [walletAddress, token, decimals, refresh],
  );

  /** Withdraw the whole Blend position to the wallet and stop (no reinvest). */
  const withdrawToWallet = useCallback(async () => {
    if (!walletAddress || !token) throw new Error('Wallet or token not ready');
    await directBlendWithdraw({ address: walletAddress, amount: '0', decimals, withdrawAll: true });
    refresh();
  }, [walletAddress, token, decimals, refresh]);

  return { needsMigration, hasBorrow, blendBalance, decimals, migrateToVault, withdrawToWallet };
};
