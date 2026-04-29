'use client';

import { DepositWithdrawalState, VaquitaAnimationState } from '../../../types';
import SleepingAnimation from '../../templates/WorldMap/vaquita/animations/SleepingAnimation';
import WalkingAnimation from '../../templates/WorldMap/vaquita/animations/WalkingAnimation';
import WorkingAnimation from '../../templates/WorldMap/vaquita/animations/WorkingAnimation';

interface VaquitaProps {
  status: DepositWithdrawalState;
  brainState: VaquitaAnimationState;
  direction: [number, number];
  scale: number;
  label?: string;
}

export const VaquitaAnimation = ({ direction, scale, status, brainState, label }: VaquitaProps) => {
  const blinkColor = blinkColorFor(status);
  const blinking = blinkColor !== undefined;

  if (brainState === 'sleeping') {
    return <SleepingAnimation direction={direction} scale={scale} label={label} />;
  }

  if (brainState === 'working') {
    return (
      <WorkingAnimation
        direction={direction}
        scale={scale}
        position={{ x: 0, y: 0, z: 0 }}
        label={label}
      />
    );
  }

  return <WalkingAnimation direction={direction} scale={scale} blinking={blinking} color={blinkColor} label={label} />;
};

const blinkColorFor = (status: DepositWithdrawalState): string | undefined => {
  switch (status) {
    case DepositWithdrawalState.DEPOSIT_PROCESSING:
      return '#fff';
    case DepositWithdrawalState.WITHDRAW_PROCESSING:
      return '#F7BC5C';
    case DepositWithdrawalState.WITHDRAW_FAILED:
      return '#f3616f';
    default:
      return undefined;
  }
};
