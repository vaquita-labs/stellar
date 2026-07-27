'use client';

import { useConfigStore } from '@/core-ui/stores';
import { DepositFn, DepositFunction, WithdrawFn, WithdrawFunction } from '@/core-ui/types';
import { stellarTransactions } from '@/networks/stellar/stellarTransactions';
import { useMemo } from 'react';

// Single-network (Stellar): replaces the old TransactionsProvider + transaction store.
// The deposit/withdraw wrappers (logging + result normalization) live here, and the
// network implementation is resolved lazily per call so wallet state is always fresh.
export function useTransactions(): {
  transactionDeposit: DepositFunction | null;
  transactionWithdraw: WithdrawFunction | null;
} {
  const token = useConfigStore((s) => s.token);

  return useMemo(() => {
    if (!token) {
      return { transactionDeposit: null, transactionWithdraw: null };
    }

    const transactionDeposit: DepositFunction = async (nonce, amount, lockPeriod) => {
      const log: Parameters<DepositFn>[3] = (...props) => {
        console.info('[transactionDeposit]:', ...props);
      };
      try {
        log('init', { nonce: String(nonce), amount });
        const { transactionDeposit: deposit } = await stellarTransactions(token);
        const { success, txHash, transaction, depositIdHex, explorer, error } = await deposit(nonce, amount, lockPeriod, log);
        if (success && !!txHash && !!transaction && !!depositIdHex && !error) {
          console.info(`[transactionDeposit] ✅`, { nonce: String(nonce), amount, txHash, transaction });
          if (explorer) {
            console.info('[transactionDeposit] ✅', explorer);
          }
          return { success: true, txHash, transaction, depositIdHex, explorer, error };
        }
        console.error('[transactionDeposit] ❌:', { nonce: String(nonce), amount, txHash, transaction, error });
        if (explorer) {
          console.info('[transactionDeposit] ❌', explorer);
        }
        return { success: false, txHash, transaction, depositIdHex, explorer, error };
      } catch (error) {
        console.error('[transactionDeposit] ❌:', { nonce: String(nonce), amount, error });
        return { success: false, txHash: '', transaction: null, depositIdHex: '', explorer: '', error };
      }
    };

    const transactionWithdraw: WithdrawFunction = async (nonce, vaquitaContractAddress) => {
      const log: Parameters<WithdrawFn>[2] = (...props) => {
        console.info('[transactionWithdraw]:', ...props);
      };
      try {
        log('init', { nonce: String(nonce), vaquitaContractAddress });
        const { transactionWithdraw: withdraw } = await stellarTransactions(token);
        const { success, txHash, transaction, explorer, error } = await withdraw(
          nonce,
          vaquitaContractAddress,
          log,
        );
        if (success && !!txHash && !!transaction && !error) {
          console.info(`[transactionWithdraw] ✅`, { nonce: String(nonce), vaquitaContractAddress, txHash, transaction });
          if (explorer) {
            console.info('[transactionWithdraw] ✅', explorer);
          }
          return { success: true, txHash, transaction, explorer, error };
        }
        console.error('[transactionWithdraw] ❌:', { nonce: String(nonce), vaquitaContractAddress, txHash, transaction, error });
        if (explorer) {
          console.info('[transactionWithdraw] ❌', explorer);
        }
        return { success: false, txHash, transaction, explorer, error };
      } catch (error) {
        console.error('[transactionWithdraw] ❌:', { nonce: String(nonce), vaquitaContractAddress, error });
        return { success: false, txHash: '', transaction: null, explorer: '', error };
      }
    };

    return { transactionDeposit, transactionWithdraw };
  }, [token]);
}