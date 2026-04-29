'use client';

import { FiArrowUp } from 'react-icons/fi';

type EarnChipDeposit = {
  amount: number;
  createdTimestamp: number;
};

type EarnChipProps = {
  deposits: EarnChipDeposit[];
  apy: number;
  isLoading?: boolean;
  onClick?: () => void;
};

export const EarnChip = ({ deposits, apy, isLoading, onClick }: EarnChipProps) => {
  const hasDeposits = deposits.length > 0;
  const Wrapper: 'button' | 'div' = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="flex items-center gap-0.5"
    >
      <FiArrowUp className="text-[#2f820b]" size={12} strokeWidth={3} />
      <span className="text-sm font-bold text-[#2f820b] tabular-nums leading-none">
        {isLoading ? '—' : !hasDeposits ? '0%' : `${apy.toFixed(2)}%`}
      </span>
      <span className="text-[10px] font-bold text-[#2f820b]/80 leading-none ml-0.5"></span>
    </Wrapper>
  );
};
