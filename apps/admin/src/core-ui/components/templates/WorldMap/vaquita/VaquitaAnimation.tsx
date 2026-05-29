'use client';

import { DepositWithdrawalState } from '@/core-ui/types/commons';
import WalkingAnimation from './animations/WalkingAnimation';
import WithdrawAnimation from './animations/WithdrawAnimation';

interface VaquitaProps {
  status: DepositWithdrawalState;
  direction: [number, number];
  scale: number;
  label?: string;
}

export const VaquitaAnimation = ({ direction, scale, status, label }: VaquitaProps) => {
  if (status === DepositWithdrawalState.DEPOSIT_PROCESSING)
    return <WalkingAnimation direction={direction} scale={scale} blinking color="#fff" label={label} />;
  if (status === DepositWithdrawalState.DEPOSIT_SUCCESS)
    return <WalkingAnimation direction={direction} scale={scale} label={label} />;
  if (status === DepositWithdrawalState.WITHDRAW_PROCESSING)
    return <WalkingAnimation direction={direction} scale={scale} blinking color="#F7BC5C" label={label} />;
  // TODO: add angel animation
  // if (status === DepositWithdrawalState.WITHDRAW_SUCCESS)
  //   return <AngelAnimation direction={direction} scale={scale} label={label} />;
  if (status === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY)
    return <WithdrawAnimation scale={scale} label={label} />;
  if (status === DepositWithdrawalState.WITHDRAW_FAILED)
    return <WalkingAnimation direction={direction} scale={scale} blinking color="#f3616f" label={label} />;
  // if (status === DepositWithdrawalState.DEPOSIT_FAILED)
  //   return <WalkingAnimation position={position} direction={direction} scale={scale} blinking color="#f3616f" label={label} />;
  return null;
};
