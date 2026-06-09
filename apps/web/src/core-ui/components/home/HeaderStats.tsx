'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { useMapStore, useConfigStore } from '@/core-ui/stores';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { FiBell } from 'react-icons/fi';
import {
  useApyByLockPeriod,
  useDepositsComplete,
  useProfileData,
  useProfileExperience,
  useProfileRewards,
  useProfileStreak,
  useUnreadNotificationsCount,
} from '../../hooks';
import { GOLD_COIN, useElementPositionsStore, useHideBalance } from '../../stores';
import { PageHeader } from '../molecules';
import { BankAPYModal, CoinsModal, ExperienceModal, StreakModal } from '../organisms';
import { DepositEarnings, DepositEarningsReporter } from './DepositEarningsReporter';
import { EarnChip } from './EarnChip';

export const HeaderStats = () => {
  const { t } = useTranslation();
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showCoinsModal, setShowCoinsModal] = useState(false);
  const [showExperienceModal, setShowExperienceModal] = useState(false);
  const [showBankAPYModal, setShowBankAPYModal] = useState(false);
  const { walletAddress, token, lockPeriod } = useConfigStore();
  const hideBalance = useHideBalance();
  const isEditingMap = useMapStore((s) => s.isEditingMap);
  const setIsEditingMap = useMapStore((s) => s.setIsEditingMap);
  const setEditMode = useMapStore((s) => s.setEditMode);
  const setPickedItem = useMapStore((s) => s.setPickedItem);
  const setEditingObjectPosition = useMapStore((s) => s.setEditingObjectPosition);

  const { data: profileData } = useProfileData();
  const { data: streakData, isLoading: streakLoading } = useProfileStreak();
  const { data: depositsData, isLoading: depositsLoading } = useDepositsComplete(walletAddress);
  const { data: profileRewards } = useProfileRewards();
  const { data: experienceData } = useProfileExperience();
  const { isLoading: apyLoading } = useApyByLockPeriod(lockPeriod ?? 0, token?.symbol ?? '');
  const { activeDeposits, activeDepositsTotalAmount } = getDepositsData(depositsData?.deposits ?? []);

  // Ganancia estimada (proyección a vencimiento) sumada desde cada depósito,
  // que reporta su estimación según el APY de su propio lock period.
  const [earningsById, setEarningsById] = useState<Record<number, DepositEarnings>>({});
  const reportEarnings = useCallback((id: number, earnings: DepositEarnings) => {
    setEarningsById((prev) => {
      const current = prev[id];
      if (current && current.vaquita === earnings.vaquita && current.protocol === earnings.protocol) {
        return prev;
      }
      return { ...prev, [id]: earnings };
    });
  }, []);
  const estimatedEarnings = activeDeposits.reduce((acc, d) => {
    const earnings = earningsById[d.id];
    return earnings ? acc + earnings.vaquita + earnings.protocol : acc;
  }, 0);

  const totalStreak = (streakData?.yesterdayStreak || 0) + (streakData?.todayStreak ? 1 : 0);
  const hasActiveStreak = !!streakData?.todayStreak;

  const goldCoins = profileRewards?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;
  const experience = experienceData?.experience ?? 0;

  const firstName = profileData?.nickname || profileData?.fullName?.split(' ')[0] || '';
  const unreadNotifications = useUnreadNotificationsCount();

  // Callback ref so the coin-animation target can live on either the editing-map
  // div or the stats-bar button (which opens the coins modal) without a type clash.
  const goldCoinRef = useRef<HTMLElement | null>(null);
  const setGoldCoinRef = useCallback((el: HTMLElement | null) => {
    goldCoinRef.current = el;
  }, []);
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
            title={t('home.shop.title', 'Shop')}
            onBack={() => {
              setIsEditingMap(false);
              setEditMode(null);
              setPickedItem(null);
              setEditingObjectPosition(null);
            }}
            rightSlot={
              <div className="flex items-center gap-1.5">
                <div ref={setGoldCoinRef} className="flex items-center gap-1">
                  <Image
                    src="/icons/global/coin.png"
                    alt={t('home.stats.goldCoinAlt', 'Gold Coin')}
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
      {/* Reporta la ganancia estimada de cada depósito activo para el EarnChip. */}
      {activeDeposits.map((d) => (
        <DepositEarningsReporter key={d.id} deposit={d} onReport={reportEarnings} />
      ))}
      <div className="w-full px-4 pt-4 pb-4 bg-primary rounded-g">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <Link href="/profile" aria-label={t('home.stats.profileAria', 'Profile')} className="relative shrink-0">
            <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center overflow-hidden border border-[#B97204]/30">
              <Image
                src="/vaquita/vaquita_isotipo.svg"
                alt={t('home.stats.profileAlt', 'Profile')}
                width={42}
                height={42}
                className="object-contain"
                priority
              />
            </div>
          </Link>

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-normal text-black/90 truncate">
              {firstName ? (
                <Trans
                  i18nKey="home.stats.greetingNamed"
                  defaults="Your savings, <b>{{name}}</b>"
                  values={{ name: firstName }}
                  components={{ b: <span className="font-bold" /> }}
                />
              ) : (
                t('home.stats.greeting', 'Your savings')
              )}
            </span>
            <button
              type="button"
              onClick={() => setShowBankAPYModal(true)}
              className="flex items-center gap-2 min-w-0 bg-transparent"
            >
              {depositsLoading && !depositsData ? (
                <Spinner size="sm" color="current" />
              ) : (
                <div data-tutorial="tutorial-balance" className='flex justify-end gap-1.5'>
                  <span className="text-2xl font-bold text-black">
                    {hideBalance ? '••••' : `$${activeDepositsTotalAmount.toFixed(2)}`}
                  </span>
                  <EarnChip
                    deposits={activeDeposits}
                    estimatedEarnings={estimatedEarnings}
                    tokenSymbol={token?.symbol}
                    isLoading={apyLoading || depositsLoading}
                  />
                </ div>
              )}
            </button>
          </div>

          <Link
            href="/notifications"
            aria-label={t('notificationsCenter.bellAria', 'Notifications')}
            className="relative shrink-0 w-10 h-10 rounded-full bg-white border border-[#B97204]/30 flex items-center justify-center"
          >
            <FiBell className="w-5 h-5 text-black" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 border border-white text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div className="absolute left-0 right-0 -bottom-10 px-4 z-20 pointer-events-none">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-1.5  pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowStreakModal(true)}
            className="flex items-center gap-1.5 flex-1 justify-center bg-transparent"
          >
            {streakLoading && !streakData ? (
              <Spinner size="sm" color="current" />
            ) : (
              <>
                <Image
                  src="/icons/global/streak_face.png"
                  alt={t('home.stats.streakAlt', 'Streak')}
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

          <button
            ref={setGoldCoinRef}
            type="button"
            onClick={() => setShowCoinsModal(true)}
            className="flex items-center gap-1.5 flex-1 justify-center bg-transparent"
          >
            <Image
              src="/icons/global/coin.png"
              alt={t('home.stats.goldCoinAlt', 'Gold Coin')}
              width={20}
              height={20}
              className="object-contain"
              priority
            />
            <span className="text-sm font-bold text-black tabular-nums">{goldCoins}</span>
          </button>

          <div className="w-px h-4 bg-black/10" />

          <button
            type="button"
            onClick={() => setShowExperienceModal(true)}
            className="flex items-center gap-1.5 flex-1 justify-center bg-transparent"
          >
            <Image
              src="/icons/global/star.png"
              alt={t('home.stats.experienceAlt', 'Experience')}
              width={20}
              height={20}
              className="object-contain"
              priority
            />
            <span className="text-sm font-bold text-black tabular-nums">
              {Math.floor(experience).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </button>
        </div>
      </div>

      {showStreakModal && <StreakModal open={showStreakModal} onOpenChange={() => setShowStreakModal(false)} />}
      {showCoinsModal && <CoinsModal open={showCoinsModal} onOpenChange={() => setShowCoinsModal(false)} coins={goldCoins} />}
      {showExperienceModal && (
        <ExperienceModal open={showExperienceModal} onOpenChange={() => setShowExperienceModal(false)} experience={experience} />
      )}
      {showBankAPYModal && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}
    </div>
  );
};
