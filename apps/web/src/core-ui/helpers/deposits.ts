import { DepositResponseDTO, DepositWithdrawalState } from '../types';

export const getDepositsData = (_deposits: DepositResponseDTO[]) => {
  const deposits = _deposits
    .filter(
      (deposit) =>
        deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS ||
        deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS
    )
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  const activeDeposits = deposits
    .filter((deposit) => deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  const withdrawnDeposits = deposits
    .filter((deposit) => deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  const activeDepositsTotalAmount = activeDeposits.reduce((acc, deposit) => acc + deposit.amount, 0);

  return {
    deposits,
    activeDeposits,
    withdrawnDeposits,
    activeDepositsTotalAmount,
  };
};
