import type { DepositSummaryResponseDTO, DepositWithState } from '../../types';

export const toDepositSummaryResponseDTO = (deposit: DepositWithState): DepositSummaryResponseDTO => {
  const inLockPeriod = (new Date(deposit.confirmed_at || deposit.created_at || 0).getTime() + new Date(deposit.lock_period || 0).getTime()) > Date.now();
  return {
    id: deposit.id,
    state: deposit.state,
    amount: deposit.amount,
    tokenSymbol: deposit.tokens?.symbol ?? '',
    inLockPeriod,
    lockPeriod: deposit.lock_period,
    vaquitaContractAddress: deposit.vaquita_contract_address ?? '',
  };
};
