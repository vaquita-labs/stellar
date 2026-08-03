import { usePollar } from '@pollar/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { isPassiveVaultEnabled } from '@/core-ui/config/featureFlags';
import { useConfigStore } from '@/core-ui/stores';
import { awaitUsdcCredit, directBlendWithdraw, readUsdcBalance } from '@/networks/stellar/blendDirect';
import { vaultDeposit } from '@/networks/stellar/vaultDirect';
import { defindexVaultConfigForToken, formatBaseUnits } from '@/networks/stellar/vaultQueries';
import { useBlendPosition } from './useBlendPosition';

/**
 * Migration of a legacy direct-to-Blend position into the DeFindex vault.
 * Self-derived from the LIVE Blend collateral (read each render), so it's
 * resumable with no stored state: once the Blend collateral hits 0 the migration
 * is no longer needed and the prompt disappears — a user who withdrew but bailed
 * before depositing just resumes at a normal vault deposit (funds already in
 * wallet).
 *
 * `isExternal` separates the two audiences. On a custodial wallet the Blend
 * position is one Vaquita opened on the user's behalf, so the prompt moves all of
 * it. On an external wallet the user supplied to Blend themselves, so it is an
 * offer: they pick how much to move, and `migrateToVault` honours a partial
 * amount by withdrawing exactly that much and leaving the rest in Blend.
 *
 * A borrow against the collateral makes the withdraw fail Blend's health check,
 * so `hasBorrow` blocks the migration until the user repays.
 */
export const usePassiveMigration = (walletAddress?: string) => {
  const token = useConfigStore((s) => s.token);
  const queryClient = useQueryClient();
  const blend = useBlendPosition(walletAddress);
  const { wallet } = usePollar();

  const decimals = token?.decimals ?? 7;
  const blendBalance = blend.data?.usdc ?? 0;
  const hasBorrow = (blend.data?.borrow ?? 0) > 0;
  const vaultConfigured = !!defindexVaultConfigForToken(token);
  // Freighter/xBull: the Blend position is the user's own, not one we opened.
  const isExternal = wallet?.custody === 'external';
  const needsMigration = isPassiveVaultEnabled() && vaultConfigured && !!walletAddress && blendBalance > 0;

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
    void queryClient.invalidateQueries({ queryKey: ['defindex-vault-position'] });
  }, [queryClient]);

  /**
   * Withdraw from Blend and deposit what landed into the vault. `amount` moves
   * exactly that much and leaves the rest in Blend; omitting it (or passing the
   * whole position) moves everything via the withdraw-all sentinel, which avoids
   * leaving dust behind.
   *
   * Two non-atomic txs; if the deposit is interrupted, the withdrawn funds are
   * safe in the wallet and the user resumes at a normal deposit. Only the delta
   * the withdraw actually produced is deposited — the rest of the wallet is
   * never swept. The withdraw is ledger-confirmed before the delta is measured,
   * and `awaitUsdcCredit` waits for the RPC to catch up, so a slow node can no
   * longer make the migration a silent no-op.
   */
  const migrateToVault = useCallback(
    async (amount?: number) => {
      if (!walletAddress || !token) throw new Error('Wallet or token not ready');
      // null = move the whole position; a number = that partial amount.
      const partial = amount != null && amount > 0 && amount < blendBalance ? amount : null;

      const walletBefore = await readUsdcBalance(walletAddress, decimals);
      const { hash } = await directBlendWithdraw({
        address: walletAddress,
        amount: partial != null ? partial.toFixed(decimals) : '0',
        decimals,
        withdrawAll: partial == null,
      });

      // The withdraw is on chain from here on, so the Blend position has to be
      // refreshed even if the deposit leg fails: the prompt reads off it.
      try {
        const receivedBase = await awaitUsdcCredit(walletAddress, decimals, walletBefore, { hash });
        await vaultDeposit({
          address: walletAddress,
          amount: formatBaseUnits(receivedBase, decimals),
          decimals,
        });
      } finally {
        refresh();
      }
    },
    [walletAddress, token, decimals, blendBalance, refresh],
  );

  /** Withdraw the whole Blend position to the wallet and stop (no reinvest). */
  const withdrawToWallet = useCallback(async () => {
    if (!walletAddress || !token) throw new Error('Wallet or token not ready');
    await directBlendWithdraw({ address: walletAddress, amount: '0', decimals, withdrawAll: true });
    refresh();
  }, [walletAddress, token, decimals, refresh]);

  return { needsMigration, isExternal, hasBorrow, blendBalance, decimals, migrateToVault, withdrawToWallet };
};
