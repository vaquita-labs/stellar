import { getWalletAddress, toHexFromAny } from '@/core-ui/helpers';
import { DepositFn, NetworkResponseDTO, WithdrawFn } from '../../core-ui/types';
import { isStellarWalletConnected, stellarExpertTxUrl } from './helpers';
import { getSorobanTx } from './sorobanTx';

export const stellarTransactions = async ({ decimals, vaquitaContractAddress }: NetworkResponseDTO['tokens'][number]) => {
  const address = getWalletAddress();
  const isConnected = isStellarWalletConnected();
  const { deposit, withdraw } = getSorobanTx({
    address,
    contractId: vaquitaContractAddress,
  });

  const transactionDeposit: DepositFn = async (id: number, amount: number, lockPeriod, log) => {
    if (!isConnected || !address) {
      return {
        success: false,
        txHash: '',
        transaction: null,
        explorer: '',
        depositIdHex: '',
        error: new Error('Please connect a wallet first.'),
      };
    }

    const depositIdHex = await toHexFromAny(id, 32);
    log('normalized depositIdHex:', { id, depositIdHex });

    const period = BigInt(lockPeriod / 1000); // 7 días (ajusta si corresponde)

    log('stellar deposit', {
      depositId: depositIdHex,
      humanAmount: amount.toString(),
      tokenDecimals: decimals,
      period,
    });
    const transaction = await deposit({
      depositId: depositIdHex,
      humanAmount: amount.toString(),
      tokenDecimals: decimals,
      period,
    });

    const { hash } = transaction;

    return {
      success: true,
      txHash: hash as string,
      transaction,
      depositIdHex,
      explorer: stellarExpertTxUrl(hash as string),
      error: null,
    };
  };

  const transactionWithdraw: WithdrawFn = async (_: number, depositIdHex: string) => {
    if (!isConnected || !address) {
      return {
        success: false,
        txHash: '',
        transaction: null,
        explorer: '',
        error: new Error('Please connect a wallet first.'),
      };
    }

    const transaction = await withdraw({
      depositId: depositIdHex,
    });

    const { hash } = transaction;

    return {
      success: true,
      txHash: hash as string,
      transaction,
      explorer: stellarExpertTxUrl(hash as string),
      error: null,
    };
  };

  return {
    transactionDeposit,
    transactionWithdraw,
  };
};
