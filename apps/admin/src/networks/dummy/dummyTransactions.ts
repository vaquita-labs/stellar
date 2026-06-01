import { v4 } from 'uuid';
import { DepositFn, WithdrawFn } from '../../core-ui/types';

export const dummyTransactions = () => {
  const transactionDeposit: DepositFn = async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000 * Math.random()));
    const depositIdHex = v4();
    return { success: true, txHash: 'dummy_' + depositIdHex, depositIdHex, explorer: '', transaction: {}, error: null };
  };

  const transactionWithdraw: WithdrawFn = async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000 * Math.random()));
    return { success: true, txHash: 'dummy_' + v4(), explorer: '', transaction: {}, error: null };
  };

  return {
    transactionDeposit,
    transactionWithdraw,
  };
};
