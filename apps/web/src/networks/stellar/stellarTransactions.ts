import { getWalletAddress } from '@/core-ui/helpers';
import { DepositFn, NetworkResponseDTO, WithdrawFn } from '../../core-ui/types';
import { isStellarWalletConnected, stellarExpertTxUrl } from './helpers';
import { getComputedDepositId } from './poolQueries';
import { getSorobanTx } from './sorobanTx';

export const stellarTransactions = async ({ decimals, vaquitaContractAddress }: NetworkResponseDTO['tokens'][number]) => {
  const address = getWalletAddress();
  const isConnected = isStellarWalletConnected();
  const { deposit, withdraw } = getSorobanTx({
    address,
    contractId: vaquitaContractAddress,
  });

  const transactionDeposit: DepositFn = async (nonce, amount: number, lockPeriod, log) => {
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

    // Ask the contract (via compute_deposit_id) for the exact position id it
    // stores — the same value the deposit event carries — so we never guess the
    // hash client-side. Empty string if the read fails; the nonce (stored
    // separately) is what withdrawal actually needs.
    const depositIdHex = (await getComputedDepositId(vaquitaContractAddress, address, nonce)) ?? '';
    log('computed depositIdHex:', { nonce: String(nonce), depositIdHex });

    const period = BigInt(lockPeriod / 1000); // 7 días (ajusta si corresponde)

    log('stellar deposit', {
      nonce: String(nonce),
      humanAmount: amount.toString(),
      tokenDecimals: decimals,
      period,
    });
    const transaction = await deposit({
      nonce,
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

  const transactionWithdraw: WithdrawFn = async (nonce) => {
    if (!isConnected || !address) {
      return {
        success: false,
        txHash: '',
        transaction: null,
        explorer: '',
        error: new Error('Please connect a wallet first.'),
      };
    }

    const transaction = await withdraw({ nonce });

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
