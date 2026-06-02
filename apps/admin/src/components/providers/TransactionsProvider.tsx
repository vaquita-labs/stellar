'use client';

import { useNetworkConfigStore, useTransactionStore } from '@/core-ui/stores';
import { DepositFn, DepositFunction, WithdrawFn, WithdrawFunction } from '@/core-ui/types';
import { isDummyNetwork } from '@/networks/dummy';
import { dummyTransactions } from '@/networks/dummy/dummyTransactions';
import { useEffect } from 'react';

// TODO(single-network): admin is Stellar-only now, so this no longer comes from the
// token resolved via /api/v1/network. Hardcoded for now — move to project-config
// when the backend exposes it.
const VAQUITA_CONTRACT_ADDRESS = '';

export function TransactionsProvider() {
  const { setTransactions } = useTransactionStore();
  const { walletAddress, setWalletAddress, reset } = useNetworkConfigStore();
  useEffect(() => {
    (async () => {
      try {
        let transactions: { transactionDeposit: DepositFn; transactionWithdraw: WithdrawFn };
        if (isDummyNetwork()) {
          transactions = dummyTransactions();
        }

        const transactionDeposit: DepositFunction = async (id, amount, lockPeriod) => {
          const log: Parameters<DepositFn>[3] = (...props) => {
            console.info('[transactionDeposit]:', ...props);
          };
          try {
            log('init', { id, amount });
            const { success, txHash, transaction, depositIdHex, explorer, error } =
              (await transactions?.transactionDeposit?.(id, amount, lockPeriod, log)) || {
                success: false,
                txHash: '',
                transaction: null,
                error: null,
              };
            if (success && !!txHash && !!transaction && !!depositIdHex && !error) {
              console.info(`[transactionDeposit] ✅`, { id, amount, txHash, transaction });
              if (explorer) {
                console.info('[transactionDeposit] ✅', explorer);
              }
              return { success: true, txHash, transaction, depositIdHex, explorer, error };
            } else {
              console.error('[transactionDeposit] ❌:', { id, amount, txHash, transaction, error });
              if (explorer) {
                console.info('[transactionDeposit] ❌', explorer);
              }
              return { success: false, txHash, transaction, depositIdHex, explorer, error };
            }
          } catch (error) {
            console.error('[transactionDeposit] ❌:', { id, amount, error });
            return { success: false, txHash: '', transaction: null, depositIdHex: '', explorer: '', error };
          }
        };

        const transactionWithdraw: WithdrawFunction = async (id: number, depositIdHex: string) => {
          const log: Parameters<WithdrawFn>[3] = (...props) => {
            console.info('[transactionWithdraw]:', ...props);
          };
          try {
            log('init', { id, depositIdHex });
            const { success, txHash, transaction, explorer, error } = (await transactions?.transactionWithdraw?.(
              id,
              depositIdHex,
              VAQUITA_CONTRACT_ADDRESS,
              log
            )) || { success: false, txHash: '', transaction: null, error: null };
            if (success && !!txHash && !!transaction && !error) {
              console.info(`[transactionWithdraw] ✅`, { id, depositIdHex, txHash, transaction });
              if (explorer) {
                console.info('[transactionWithdraw] ✅', explorer);
              }
              return { success: true, txHash, transaction, explorer, error };
            } else {
              console.error('[transactionWithdraw] ❌:', { id, depositIdHex, txHash, transaction, error });
              if (explorer) {
                console.info('[transactionWithdraw] ❌', explorer);
              }
              return { success: false, txHash, transaction, explorer, error };
            }
          } catch (error) {
            console.error('[transactionWithdraw] ❌:', { id, depositIdHex, error });
            return { success: false, txHash: '', transaction: null, explorer: '', error };
          }
        };
        setTransactions(transactionDeposit, transactionWithdraw);
      } catch (error) {
        console.error('error on setTransactions', error);
        setTransactions(null, null);
        reset();
      }
    })();
  }, [walletAddress, reset, setWalletAddress, setTransactions]);

  return null;
}
