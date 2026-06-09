'use client';

import { FiArrowUp } from 'react-icons/fi';

type EarnChipDeposit = {
  amount: number;
  createdTimestamp: number;
};

type EarnChipProps = {
  deposits: EarnChipDeposit[];
  estimatedEarnings: number;
  tokenSymbol?: string;
  isLoading?: boolean;
  onClick?: () => void;
};

export const EarnChip = ({ deposits, estimatedEarnings, tokenSymbol, isLoading, onClick }: EarnChipProps) => {
  const hasDeposits = deposits.length > 0;
  const Wrapper: 'button' | 'div' = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="flex items-center gap-0.5"
    >
      <span className="text-sm font-bold text-[#2f820b] tabular-nums leading-none">
        {isLoading
          ? '—'
          : `+${(hasDeposits ? estimatedEarnings : 0).toFixed(2)}`}
      </span>
      <span className="text-[10px] font-bold text-[#2f820b]/80 leading-none ml-0.5"></span>
    </Wrapper>
  );
};
