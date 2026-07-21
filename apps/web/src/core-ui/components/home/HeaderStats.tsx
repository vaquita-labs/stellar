'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { useMapStore, useConfigStore } from '@/core-ui/stores';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowUpRight, FiBell, FiZap } from 'react-icons/fi';
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
import { useModalPresence } from '../molecules/AppModal';
import {
  BankAPYModal,
  CoinsModal,
  EarningsModal,
  ExperienceModal,
  ReferralsModal,
  StreakModal,
  useReferralBoost,
} from '../organisms';
import { DailyRewardChest } from './DailyRewardChest';
import { MapClock } from './MapClock';
import { MapQuickActions } from './MapQuickActions';
import { DepositEarnings, DepositEarningsReporter } from './DepositEarningsReporter';

export const HeaderStats = () => {
  const { t } = useTranslation();
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showCoinsModal, setShowCoinsModal] = useState(false);
  const [showExperienceModal, setShowExperienceModal] = useState(false);
  const [showBankAPYModal, setShowBankAPYModal] = useState(false);
  const [showEarningsModal, setShowEarningsModal] = useState(false);
  const [showReferralsModal, setShowReferralsModal] = useState(false);
  // Mantienen el modal montado mientras corre la animación de salida.
  const streakModalMounted = useModalPresence(showStreakModal);
  const coinsModalMounted = useModalPresence(showCoinsModal);
  const experienceModalMounted = useModalPresence(showExperienceModal);
  const bankAPYModalMounted = useModalPresence(showBankAPYModal);
  const earningsModalMounted = useModalPresence(showEarningsModal);
  const referralsModalMounted = useModalPresence(showReferralsModal);
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
  const { data: apyData, isLoading: apyLoading } = useApyByLockPeriod(lockPeriod ?? 0, token?.symbol ?? '');
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
  const { vaquitaEarnings, protocolEarnings } = activeDeposits.reduce(
    (acc, d) => {
      const earnings = earningsById[d.id];
      if (earnings) {
        acc.vaquitaEarnings += earnings.vaquita;
        acc.protocolEarnings += earnings.protocol;
      }
      return acc;
    },
    { vaquitaEarnings: 0, protocolEarnings: 0 },
  );

  // APY base (lo que rinde el ahorro hoy) y boost de referidos, que se suma
  // aparte porque tiene su propia pantalla y su propio color en el header.
  const baseApy = (apyData?.vaquitaApy ?? 0) + (apyData?.protocolApy ?? 0);
  const { apyBonus } = useReferralBoost(walletAddress);

  // El saldo se muestra completo (sin recortar a 2 decimales) porque el rendimiento
  // se acumula en fracciones que el usuario quiere ver moverse.
  const formattedBalance = activeDepositsTotalAmount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

  const totalStreak = (streakData?.yesterdayStreak || 0) + (streakData?.todayStreak ? 1 : 0);
  const hasActiveStreak = !!streakData?.todayStreak;

  const goldCoins = profileRewards?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;
  const experience = experienceData?.experience ?? 0;

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
      {/* Reporta la ganancia estimada de cada depósito activo para el desglose. */}
      {activeDeposits.map((d) => (
        <DepositEarningsReporter key={d.id} deposit={d} onReport={reportEarnings} />
      ))}
      <div className="w-full px-4 pt-4 pb-4 bg-primary rounded-g">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <Link href="/profile" aria-label={t('home.stats.profileAria', 'Profile')} className="relative shrink-0">
            <div className="relative w-14 h-14 rounded-full bg-white flex items-center justify-center overflow-hidden border border-[#B97204]/30">
              {profileData?.avatarUrl ? (
                // Real uploaded photo: fill the circle (object-cover). next/image
                // fetches it server-side and re-serves over https, so an http
                // MinIO source still renders on an https page.
                <Image
                  src={profileData.avatarUrl}
                  alt={t('home.stats.profileAlt', 'Profile')}
                  fill
                  sizes="56px"
                  className="object-cover"
                  priority
                />
              ) : (
                <Image
                  src="/vaquita/vaquita_isotipo.svg"
                  alt={t('home.stats.profileAlt', 'Profile')}
                  width={42}
                  height={42}
                  className="object-contain"
                  priority
                />
              )}
            </div>
          </Link>

          <div className="flex flex-col min-w-0 flex-1 gap-1">
            <button
              type="button"
              onClick={() => setShowBankAPYModal(true)}
              className="flex items-center min-w-0 bg-transparent text-left"
            >
              {depositsLoading && !depositsData ? (
                <Spinner size="sm" color="current" />
              ) : (
                <span
                  data-tutorial="tutorial-balance"
                  className="text-xl font-bold text-black tabular-nums leading-none truncate"
                >
                  {hideBalance ? '••••' : `$${formattedBalance}`}
                </span>
              )}
            </button>

            {/* APY base (verde) y boost de referidos (morado): cada uno abre su
                propia explicación. */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setShowEarningsModal(true)}
                aria-label={t('home.stats.apyAria', 'Earnings breakdown')}
                className="flex items-center gap-0.5 bg-transparent shrink-0"
              >
                <FiArrowUpRight className="w-3 h-3 text-[#0a5c2e] shrink-0" />
                <span className="text-xs font-bold text-[#0a5c2e] tabular-nums leading-none whitespace-nowrap">
                  {apyLoading ? '—' : `${baseApy.toFixed(2)}% APY`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowReferralsModal(true)}
                aria-label={t('home.stats.boostAria', 'Referral boost')}
                className="flex items-center gap-0.5 bg-transparent shrink-0"
              >
                <FiZap className="w-3 h-3 text-[#5b1eb5] shrink-0" />
                <span className="text-xs font-bold text-[#5b1eb5] tabular-nums leading-none whitespace-nowrap">
                  {apyBonus.toFixed(2)}%
                </span>
              </button>
            </div>
          </div>

          <Link
            href="/notifications"
            aria-label={t('notificationsCenter.bellAria', 'Notifications')}
            className="relative shrink-0 self-start w-8 h-8 rounded-full bg-white border border-[#B97204]/30 flex items-center justify-center"
          >
            <FiBell className="w-4 h-4 text-black" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 border border-white text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Offsets en px fijos (no las clases rem de Tailwind) para que la
          distancia al bloque naranja sea la misma en todos los dispositivos,
          aunque el usuario tenga el tamaño de fuente del sistema agrandado. */}
      <div className="absolute left-0 right-0 -bottom-[36px] px-1 z-20 pointer-events-none">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2 bg-white/60 backdrop-blur-md rounded-lg px-3 py-1.5  pointer-events-auto">
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
                <span className="text-xs font-bold text-black tabular-nums">
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
            <span className="text-xs font-bold text-black tabular-nums">{goldCoins}</span>
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
            <span className="text-xs font-bold text-black tabular-nums">
              {Math.floor(experience).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </button>
        </div>
      </div>

      {/* Fila flotante sobre el cielo, anclada al borde inferior del bloque
          naranja (top-full) con un offset en px fijos: 36px que ocupa el pill
          de stats + 4px de aire. Reloj a la izquierda (el ciclo de luz del mapa
          sigue esta misma hora) y accesos rápidos + cofre a la derecha, ambos
          en el mismo contenedor centrado max-w-xl para que arranquen a la misma
          altura y a la misma distancia del naranja en cualquier pantalla.
          La columna derecha es solo móvil: en escritorio vive en el sidebar. */}
      <div className="absolute left-0 right-0 top-full mt-[40px] px-1 z-20 pointer-events-none">
        <div className="max-w-xl mx-auto flex items-start justify-between gap-2">
          <div className="pointer-events-auto">
            <MapClock />
          </div>
          <div className="flex flex-col items-center gap-2 pointer-events-auto md:hidden">
            <MapQuickActions />
            <DailyRewardChest />
          </div>
        </div>
      </div>

      {streakModalMounted && <StreakModal open={showStreakModal} onOpenChange={() => setShowStreakModal(false)} />}
      {coinsModalMounted && <CoinsModal open={showCoinsModal} onOpenChange={() => setShowCoinsModal(false)} coins={goldCoins} />}
      {experienceModalMounted && (
        <ExperienceModal open={showExperienceModal} onOpenChange={() => setShowExperienceModal(false)} experience={experience} />
      )}
      {bankAPYModalMounted && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}
      {earningsModalMounted && (
        <EarningsModal
          open={showEarningsModal}
          onOpenChange={() => setShowEarningsModal(false)}
          vaquitaEarnings={vaquitaEarnings}
          protocolEarnings={protocolEarnings}
          protocolApy={apyData?.protocolApy ?? 0}
          lendingMarketName={apyData?.lendingMarketName}
          tokenSymbol={token?.symbol}
        />
      )}
      {referralsModalMounted && (
        <ReferralsModal open={showReferralsModal} onOpenChange={() => setShowReferralsModal(false)} />
      )}
    </div>
  );
};
