import { DepositResponseDTO, DepositWithdrawalState } from '../types';

export const getDepositsData = (_deposits: DepositResponseDTO[]) => {
  const deposits = _deposits
    .filter(
      (deposit) =>
        deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS ||
        deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS ||
        deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY
    )
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  const activeDeposits = deposits
    .filter((deposit) => deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  // Retirados: tanto los que completaron el lock como los retirados antes
  // (early), para poder ver el detalle de lo ganado o perdido.
  const withdrawnDeposits = deposits
    .filter(
      (deposit) =>
        deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS ||
        deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY
    )
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  const activeDepositsTotalAmount = activeDeposits.reduce((acc, deposit) => acc + deposit.amount, 0);

  return {
    deposits,
    activeDeposits,
    withdrawnDeposits,
    activeDepositsTotalAmount,
  };
};
