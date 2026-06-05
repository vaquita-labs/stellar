'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { useMapStore, useConfigStore } from '@/core-ui/stores';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  useApyByLockPeriod,
  useDepositsComplete,
  useProfileData,
  useProfileExperience,
  useProfileRewards,
  useProfileStreak,
} from '../../hooks';
import { GOLD_COIN, useElementPositionsStore, useHideBalance } from '../../stores';
import { PageHeader } from '../molecules';
import { BankAPYModal, StreakModal } from '../organisms';
import { EarnChip } from './EarnChip';

export const HeaderStats = () => {
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showBankAPYModal, setShowBankAPYModal] = useState(false);
  const { walletAddress, token, lockPeriod } = useConfigStore();
  const hideBalance = useHideBalance();
  const isEditingMap = useMapStore((s) => s.isEditingMap);
  const setIsEditingMap = useMapStore((s) => s.setIsEditingMap);
  const setEditMode = useMapStore((s) => s.setEditMode);
  const setPickedItem = useMapStore((s) => s.setPickedItem);

  const { data: profileData } = useProfileData();
  const { data: streakData, isLoading: streakLoading, isRefetching: streakRefetching } = useProfileStreak();
  const {
    data: depositsData,
    isLoading: depositsLoading,
    isRefetching: depositsRefetching,
  } = useDepositsComplete(walletAddress);
  const { data: profileRewards } = useProfileRewards();
  const { data: experienceData } = useProfileExperience();
  const { data: apyData, isLoading: apyLoading } = useApyByLockPeriod(lockPeriod ?? 0, token?.symbol ?? '');
  const { activeDeposits, activeDepositsTotalAmount } = getDepositsData(depositsData?.deposits ?? []);

  const totalStreak = (streakData?.yesterdayStreak || 0) + (streakData?.todayStreak ? 1 : 0);
  const hasActiveStreak = !!streakData?.todayStreak;

  const goldCoins = profileRewards?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;
  const experience = experienceData?.experience ?? 0;

  const firstName = profileData?.nickname || profileData?.fullName?.split(' ')[0] || '';

  const goldCoinRef = useRef<HTMLDivElement>(null);
  const setPositions = useElementPositionsStore((store) => store.setPositions);
  useEffect(() => {
    setPositions(GOLD_COIN, () => {
      const rect = goldCoinRef.current?.getBoundingClientRect() || { left: 0, width: 0, top: 0, height: 0 };
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    });
  }, [setPositions]);

  if (isEditingMap) {
    return (
      <div className="w-full px-4 py-3">
        <div className="max-w-xl mx-auto">
          <PageHeader
            title="Shop"
            onBack={() => {
              setIsEditingMap(false);
              setEditMode(null);
              setPickedItem(null);
            }}
            rightSlot={
              <div className="flex items-center gap-1.5">
                <div ref={goldCoinRef} className="flex items-center gap-1">
                  <Image
                    src="/icons/global/coin.png"
                    alt="Gold Coin"
                    width={20}
                    height={20}
                    className="object-contain"
                    priority
                  />
                  <span className="text-sm font-bold text-black tabular-nums">{goldCoins}</span>
                </div>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full relative">
      <div className="w-full px-4 pt-4 pb-4 bg-primary rounded-g">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <Link href="/profile" aria-label="Profile" className="relative shrink-0">
            <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center overflow-hidden border border-[#B97204]/30">
              <Image
                src="/vaquita/vaquita_isotipo.svg"
                alt="Profile"
                width={42}
                height={42}
                className="object-contain"
                priority
              />
            </div>
            <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
          </Link>

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium text-black/90 truncate">
              ¡Vamos{firstName ? `, ${firstName}` : ''}! 🐮
            </span>
            <button
              type="button"
              onClick={() => setShowBankAPYModal(true)}
              className="flex items-center gap-2 min-w-0 bg-transparent"
            >
              {depositsLoading || depositsRefetching ? (
                <Spinner size="sm" color="current" />
              ) : (
                <div className='flex justify-end gap-1.5'>
                  <span className="text-2xl font-bold text-black">
                    {hideBalance ? '••••' : `$${activeDepositsTotalAmount.toFixed(2)} ${token?.symbol}`}
                  </span>
                  <EarnChip
                    deposits={activeDeposits}
                    apy={(apyData?.vaquitaApy ?? 0) + (apyData?.protocolApy ?? 0)}
                    isLoading={apyLoading || depositsLoading}
                  />
                </ div>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="absolute left-0 right-0 -bottom-10 px-4 z-20 pointer-events-none">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2 bg-white rounded-full px-3 py-1.5  pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowStreakModal(true)}
            className="flex items-center gap-1.5 flex-1 justify-center bg-transparent"
          >
            {streakLoading || streakRefetching ? (
              <Spinner size="sm" color="current" />
            ) : (
              <>
                <Image
                  src="/icons/global/streak.png"
                  alt="Streak"
                  width={20}
                  height={20}
                  className="object-contain"
                  priority
                  style={hasActiveStreak ? {} : { filter: 'grayscale(100%)' }}
                />
                <span className="text-sm font-bold text-black tabular-nums">
                  {totalStreak}
                </span>
              </>
            )}
          </button>

          <div className="w-px h-4 bg-black/10" />

          <div ref={goldCoinRef} className="flex items-center gap-1.5 flex-1 justify-center">
            <Image
              src="/icons/global/coin.png"
              alt="Gold Coin"
              width={20}
              height={20}
              className="object-contain"
              priority
            />
            <span className="text-sm font-bold text-black tabular-nums">{goldCoins}</span>
          </div>

          <div className="w-px h-4 bg-black/10" />

          <Link href="/profile/summary" className="flex items-center gap-1.5 flex-1 justify-center">
            <Image
              src="/icons/global/star.png"
              alt="Experience"
              width={20}
              height={20}
              className="object-contain"
              priority
            />
            <span className="text-sm font-bold text-black tabular-nums">
              {Math.floor(experience).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </Link>
        </div>
      </div>

      {showStreakModal && <StreakModal open={showStreakModal} onOpenChange={() => setShowStreakModal(false)} />}
      {showBankAPYModal && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}
    </div>
  );
};
