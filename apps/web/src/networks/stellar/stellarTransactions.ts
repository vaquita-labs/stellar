import { getWalletAddress, toHexFromAny } from '@/core-ui/helpers';
import { DepositFn, NetworkResponseDTO, WithdrawFn } from '../../core-ui/types';
import { isStellarWalletConnected } from './helpers';
import { getNetworkPassphrase, getRpcUrl } from './kit';
import { getSorobanClient } from './sorobanClient';
import { getSorobanTx } from './sorobanTx';

export const stellarTransactions = async ({ decimals, vaquitaContractAddress }: NetworkResponseDTO['tokens'][number]) => {
  const rpcUrl = getRpcUrl();
  const networkPassphrase = getNetworkPassphrase();
  const address = getWalletAddress();
  const isConnected = isStellarWalletConnected();
  const clientRef = await getSorobanClient(address, vaquitaContractAddress, rpcUrl, networkPassphrase);
  const { deposit, withdraw } = getSorobanTx({
    address,
    rpcUrl,
    networkPassphrase,
    clientRef,
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
      depositIdEncoding: 'hex16-string',
    });
    const transaction = await deposit({
      depositId: depositIdHex,
      humanAmount: amount.toString(),
      tokenDecimals: decimals,
      period,
      depositIdEncoding: 'hex16-string',
    });

    const { hash } = transaction;

    return {
      success: true,
      txHash: hash as string,
      transaction,
      depositIdHex,
      explorer: `https://stellar.expert/explorer/testnet/tx/${hash}`,
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
      depositIdEncoding: 'hex16-string',
    });

    const { hash } = transaction;

    return {
      success: true,
      txHash: hash as string,
      transaction,
      explorer: `https://stellar.expert/explorer/testnet/tx/${hash}`,
      error: null,
    };
  };

  return {
    transactionDeposit,
    transactionWithdraw,
  };
};
