import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clientEnv } from '@/core-ui/config/clientEnv';
import { findOrphanedWithdrawals, type OpenPositionRef } from '@/networks/stellar/positionReconcile';
import { DepositStatus, WithdrawalStatus } from '../types';
import { useDepositsComplete } from './useDepositsComplete';

/**
 * Repairs a position the user withdrew in a tab that never got to say so.
 *
 * The withdraw's last step is a call to the API, and a reload before it lands
 * leaves the position closed on chain and open in the portfolio. The user then
 * sees money they no longer have, and the position cannot be withdrawn again
 * because its on-chain key is already gone.
 *
 * This runs beside the portfolio, checks the open positions against the chain,
 * and hands the API the transaction hash of any withdraw it finds unreported.
 * The browser does the searching on purpose: the same scan on the server would
 * be one chain crawl per visitor against a shared RPC quota, where here each
 * user spends only their own.
 *
 * It is a repair, not a feature — there is nothing to show. A healthy portfolio
 * costs one `getLedgerEntries` call and stops there, and a failure anywhere
 * along the way leaves the screen exactly as it was for the hourly reconciler
 * to fix.
 */

/**
 * Positions already looked at, so the scan runs once per page load rather than
 * once per mount. Both the portfolio and the profile mount this, and a repair
 * makes the deposits query refetch, which would otherwise walk straight back in
 * here with a new list.
 */
const checked = new Set<string>();

const isOnChainDepositId = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);

const reportWithdraw = async (txHash: string): Promise<boolean> => {
  try {
    const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/reconcile-transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash }),
    });
    if (!response.ok) {
      console.warn('[positionReconcile] server did not record the withdraw', response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[positionReconcile] reconcile-transaction', error);
    return false;
  }
};

export const usePositionReconcile = (_walletAddress?: string) => {
  const { data } = useDepositsComplete(_walletAddress);
  const queryClient = useQueryClient();

  useEffect(() => {
    const deposits = data?.deposits ?? [];
    if (deposits.length === 0) return;

    const walletAddress = deposits[0]?.walletAddress;
    if (!walletAddress) return;

    // Confirmed on chain, nothing confirmed against it since. A withdrawal row
    // that is merely `initiated` still counts as open — that is exactly the row
    // the lost call was meant to close.
    const open: OpenPositionRef[] = deposits
      .filter(
        (deposit) =>
          deposit.status === DepositStatus.CONFIRMED &&
          isOnChainDepositId(deposit.depositIdHex) &&
          !!deposit.vaquitaContractAddress &&
          !(deposit.withdrawals ?? []).some((withdrawal) => withdrawal.status === WithdrawalStatus.CONFIRMED),
      )
      .map((deposit) => ({ depositIdHex: deposit.depositIdHex, pool: deposit.vaquitaContractAddress }));

    if (open.length === 0) return;

    const signature = `${walletAddress}:${open.map((position) => position.depositIdHex).sort().join(',')}`;
    if (checked.has(signature)) return;
    checked.add(signature);

    let cancelled = false;
    void (async () => {
      const orphaned = await findOrphanedWithdrawals(walletAddress, open);
      if (cancelled || orphaned.length === 0) return;

      const reported = await Promise.all(orphaned.map((orphan) => reportWithdraw(orphan.txHash)));
      if (cancelled || !reported.some(Boolean)) return;

      console.info('[positionReconcile] repaired', orphaned.length, 'position(s)');
      void queryClient.invalidateQueries({ queryKey: ['deposit'] });
      void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
    })();

    return () => {
      cancelled = true;
    };
  }, [data, queryClient]);
};
