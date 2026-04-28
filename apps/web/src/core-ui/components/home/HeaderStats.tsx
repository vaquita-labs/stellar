'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useDepositsComplete, useProfileStreak } from '../../hooks';
import { BankAPYModal, StreakModal } from '../organisms';

export const HeaderStats = () => {
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showBankAPYModal, setShowBankAPYModal] = useState(false);
  const { walletAddress, token } = useNetworkConfigStore();

  const { data: streakData, isLoading: streakLoading, isRefetching: streakRefetching } = useProfileStreak();
  const {
    data: depositsData,
    isLoading: depositsLoading,
    isRefetching: depositsRefetching,
  } = useDepositsComplete(walletAddress);
  const { activeDepositsTotalAmount } = getDepositsData(depositsData?.deposits ?? []);

  const totalStreak = (streakData?.yesterdayStreak || 0) + (streakData?.todayStreak ? 1 : 0);
  const hasActiveStreak = !!streakData?.todayStreak;

  return (
    <div className="w-full px-4 py-3 bg-primary border-b-1 border-[#B97204] rounded-g">
      <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/profile" aria-label="Profile" className="relative shrink-0">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center overflow-hidden border border-[#B97204]/30">
              <Image
                src="/vaquita/vaquita_isotipo.svg"
                alt="Profile"
                width={36}
                height={36}
                className="object-contain"
                priority
              />
            </div>
            <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-red-500 border-2 border-primary" />
          </Link>
          <button
            type="button"
            onClick={() => setShowBankAPYModal(true)}
            className="flex flex-col items-start min-w-0 bg-transparent"
          >
            <span className="text-xs text-[#7B5A36] leading-tight">Your ranch is worth</span>
            {depositsLoading || depositsRefetching ? (
              <Spinner size="sm" color="current" />
            ) : (
              <span className="text-xl font-bold text-black leading-tight truncate">
                {activeDepositsTotalAmount} {token?.symbol}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowStreakModal(true)}
          className="flex flex-col items-center shrink-0 bg-transparent"
        >
          {streakLoading || streakRefetching ? (
            <Spinner size="sm" color="current" />
          ) : (
            <>
              <Image
                src="/icons/summary/streak.png"
                alt="Streak"
                width={28}
                height={28}
                className="object-contain"
                priority
                style={hasActiveStreak ? {} : { filter: 'grayscale(100%)' }}
              />
              <span className="text-xs font-semibold text-black">
                {totalStreak} {totalStreak === 1 ? 'day' : 'days'}
              </span>
            </>
          )}
        </button>
      </div>

      {showStreakModal && <StreakModal open={showStreakModal} onOpenChange={() => setShowStreakModal(false)} />}
      {showBankAPYModal && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}
    </div>
  );
};
