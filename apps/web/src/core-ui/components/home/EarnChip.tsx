'use client';

import { useEffect, useRef, useState } from 'react';
import { FiArrowUp } from 'react-icons/fi';

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

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

const computeEarnings = (deposits: EarnChipDeposit[], apy: number) => {
  if (!apy || deposits.length === 0) return 0;
  const now = Date.now();
  const ratePerSecond = apy / 100 / SECONDS_PER_YEAR;
  return deposits.reduce((sum, d) => {
    const elapsedSeconds = Math.max(0, (now - d.createdTimestamp) / 1000);
    return sum + d.amount * ratePerSecond * elapsedSeconds;
  }, 0);
};

export const EarnChip = ({ deposits, apy, isLoading, onClick }: EarnChipProps) => {
  const [earnings, setEarnings] = useState(() => computeEarnings(deposits, apy));
  const propsRef = useRef({ deposits, apy });
  propsRef.current = { deposits, apy };

  useEffect(() => {
    const id = window.setInterval(() => {
      const { deposits, apy } = propsRef.current;
      setEarnings(computeEarnings(deposits, apy));
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  const Wrapper: 'button' | 'div' = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="flex items-center"
    >
      <FiArrowUp className="text-[#2f820b]" size={12} strokeWidth={3} />
      <span className="text-sm font-bold text-[#2f820b] tabular-nums leading-none">
        {isLoading ? '—' : formatEarnings(earnings)}
      </span>
    </Wrapper>
  );
};

const formatEarnings = (value: number) => {
  if (value <= 0) return '$0.00';
  const fixed = value.toFixed(8);
  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '');
  return `$${trimmed}`;
};
