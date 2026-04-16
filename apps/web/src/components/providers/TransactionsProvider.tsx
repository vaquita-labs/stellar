'use client';

import { useNetworkConfigStore, useTransactionStore } from '@/core-ui/stores';
import { DepositFn, DepositFunction, WithdrawFn, WithdrawFunction } from '@/core-ui/types';
import { isDummyNetwork } from '@/networks/dummy';
import { dummyTransactions } from '@/networks/dummy/dummyTransactions';
import { isStellarNetwork } from '@/networks/stellar';
import { stellarTransactions } from '@/networks/stellar/stellarTransactions';
import { useEffect } from 'react';

export function TransactionsProvider() {
  const { setTransactions } = useTransactionStore();
  const { walletAddress, setWalletAddress, reset, network, token } = useNetworkConfigStore();
  const networkName = network?.name ?? '';
  useEffect(() => {
    (async () => {
      try {
        let transactions: { transactionDeposit: DepositFn; transactionWithdraw: WithdrawFn };
        if (isDummyNetwork()) {
          transactions = dummyTransactions();
        } else if (token && isStellarNetwork(networkName)) {
          transactions = await stellarTransactions(token);
        } else {
          setTransactions(null, null);
          // return reset();
        }
        // } else if (isCoreNetwork(networkName)) {
        // transactions = await coreTransactions();
        // } else if (token && isScrollNetwork(networkName)) {
        //   transactions = await scrollTransactions(token);

        const transactionDeposit: DepositFunction = async (id, amount, lockPeriod) => {
          const log: Parameters<DepositFn>[3] = (...props) => {
            console.info('[transactionDeposit]:', ...props);
          };
          try {
            log('init', { id, amount });
            const { success, txHash, transaction, depositIdHex, explorer, error } = (await transactions?.transactionDeposit?.(
              id,
              amount,
              lockPeriod,
              log,
            )) || {
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

        const transactionWithdraw: WithdrawFunction = async (
          id: number,
          depositIdHex: string,
          vaquitaContractAddress: string,
        ) => {
          const log: Parameters<WithdrawFn>[3] = (...props) => {
            console.info('[transactionWithdraw]:', ...props);
          };
          try {
            log('init', { id, depositIdHex, vaquitaContractAddress });
            const { success, txHash, transaction, explorer, error } = (await transactions?.transactionWithdraw?.(
              id,
              depositIdHex,
              vaquitaContractAddress,
              log,
            )) || { success: false, txHash: '', transaction: null, error: null };
            if (success && !!txHash && !!transaction && !error) {
              console.info(`[transactionWithdraw] ✅`, {
                id,
                depositIdHex,
                vaquitaContractAddress,
                txHash,
                transaction,
              });
              if (explorer) {
                console.info('[transactionWithdraw] ✅', explorer);
              }
              return { success: true, txHash, transaction, explorer, error };
            } else {
              console.error('[transactionWithdraw] ❌:', {
                id,
                depositIdHex,
                vaquitaContractAddress,
                txHash,
                transaction,
                error,
              });
              if (explorer) {
                console.info('[transactionWithdraw] ❌', explorer);
              }
              return { success: false, txHash, transaction, explorer, error };
            }
          } catch (error) {
            console.error('[transactionWithdraw] ❌:', { id, depositIdHex, vaquitaContractAddress, error });
            return { success: false, txHash: '', transaction: null, explorer: '', error };
          }
        };
        setTransactions(transactionDeposit, transactionWithdraw);
      } catch (error) {
        console.error('error on setTransactions', error);
        setTransactions(null, null);
        // reset();
      }
    })();
  }, [walletAddress, networkName, reset, setWalletAddress, setTransactions, token, network]);

  return null;
}
