'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { truncateDecimals } from '@/core-ui/helpers/strings';
import { useMapStore, useConfigStore } from '@/core-ui/stores';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiBell } from 'react-icons/fi';
import {
  useBlendPosition,
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
  CoinsModal,
  ExperienceModal,
  StreakModal,
} from '../organisms';
import { VaquitaAvatarCircle } from '../avatar/VaquitaAvatar';
import { DailyRewardChest } from './DailyRewardChest';
import { MapClock } from './MapClock';
import { MapQuickActions } from './MapQuickActions';
import { DepositEarnings, DepositEarningsReporter } from './DepositEarningsReporter';
import { PressableButton } from '../molecules/PressableButton';

export const HeaderStats = () => {
  const { t } = useTranslation();
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showCoinsModal, setShowCoinsModal] = useState(false);
  const [showExperienceModal, setShowExperienceModal] = useState(false);
  // El saldo abre el portafolio navegando a /portafolio: esa ruta la intercepta
  // el slot `@modal` y se pinta como overlay sobre /home (el mundo 3D queda
  // montado detrás, no se recarga). El panel y las posiciones viven ahí, en
  // <PortfolioFlow>. Ver [[portfolio-overlay-flow]].
  const router = useRouter();
  // Normalmente estamos en /home y esto navega (la ruta la intercepta @modal y
  // se pinta el overlay). Red de seguridad: si por una desincronización previa
  // del historial la URL ya quedó parada en /portafolio con el overlay cerrado,
  // un push idéntico Next lo deduplica a no-op y el botón "no abre". En ese caso
  // (el saldo solo es visible/tocable si el overlay NO está encima) forzamos una
  // navegación real con un query distinto para re-disparar la ruta interceptora.
  const openPortfolioPanel = () => {
    if (window.location.pathname === '/portafolio') {
      router.push(`/portafolio?r=${Date.now()}`);
    } else {
      router.push('/portafolio');
    }
  };
  // Mantienen el modal montado mientras corre la animación de salida.
  const streakModalMounted = useModalPresence(showStreakModal);
  const coinsModalMounted = useModalPresence(showCoinsModal);
  const experienceModalMounted = useModalPresence(showExperienceModal);
  const { walletAddress, token } = useConfigStore();
  const hideBalance = useHideBalance();
  const isEditingMap = useMapStore((s) => s.isEditingMap);
  const setIsEditingMap = useMapStore((s) => s.setIsEditingMap);
  const setEditMode = useMapStore((s) => s.setEditMode);
  const setPickedItem = useMapStore((s) => s.setPickedItem);
  const setEditingObjectPosition = useMapStore((s) => s.setEditingObjectPosition);

  const { data: profileData } = useProfileData();
  const { data: streakData, isLoading: streakLoading } = useProfileStreak();
  const { data: depositsData, isLoading: depositsLoading } = useDepositsComplete(walletAddress);
  // Posición de depósito directo a Blend (on-chain). Es el nivel base del
  // portafolio: entra al total junto con los locks de Vaquita.
  const {
    data: blendPosition,
    isLoading: blendLoading,
    isError: blendError,
    refetch: refetchBlend,
    dataUpdatedAt: blendUpdatedAt,
  } = useBlendPosition(walletAddress);
  const { data: profileRewards } = useProfileRewards();
  const { data: experienceData } = useProfileExperience();
  const { activeDeposits, activeDepositsTotalAmount } = getDepositsData(depositsData?.deposits ?? []);

  // Ganancia estimada (proyección a vencimiento) sumada desde cada depósito,
  // que reporta su estimación según el APY de su propio lock period.
  const [earningsById, setEarningsById] = useState<Record<number, DepositEarnings>>({});
  const reportEarnings = useCallback((id: number, earnings: DepositEarnings) => {
    setEarningsById((prev) => {
      const current = prev[id];
      if (
        current &&
        current.vaquita === earnings.vaquita &&
        current.protocol === earnings.protocol &&
        current.ratePerMs === earnings.ratePerMs
      ) {
        return prev;
      }
      return { ...prev, [id]: earnings };
    });
  }, []);
  // Saldo en vivo: capital + interés devengado hasta "ahora". Cada depósito
  // reporta cuánto rinde por milisegundo, así que el contador avanza en el
  // cliente sin volver a pedirle nada al servidor. Tick corto para que los
  // últimos decimales se vean moverse.
  const [clientNow, setClientNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClientNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const accruedInterest = activeDeposits.reduce((acc, d) => {
    const earnings = earningsById[d.id];
    if (!earnings) return acc;
    // Igual que en la card: la lista viene cacheada, así que el "ahora" real se
    // deriva del reloj del servidor + lo transcurrido desde el fetch.
    const now =
      d.serverTimestamp && d.fetchedAtTimestamp
        ? d.serverTimestamp + (clientNow - d.fetchedAtTimestamp)
        : clientNow;
    const elapsed = Math.max(0, now - d.createdTimestamp);
    return acc + Math.min(earnings.maxInterest, earnings.ratePerMs * elapsed);
  }, 0);

  // Seis decimales fijos, todos del mismo tamaño: los últimos corren solos a
  // medida que se devenga el rendimiento. Total = locks (capital + interés) +
  // posición directa en Blend (nivel base, líquido).
  const blendBalance = blendPosition?.usdc ?? 0;
  const blendApy = blendPosition?.apy ?? 0;
  // Proyección en vivo del rendimiento de Blend entre refetches, igual que los
  // locks: capital × APY prorrateado por el tiempo transcurrido desde el último
  // fetch on-chain. Así el saldo de Blend también "crece de a poco" en pantalla.
  // Al próximo refetch (60s) snapea al valor real, corrigiendo cualquier deriva.
  // OJO: la magnitud la manda el APY — en testnet Blend rinde ~0.1%, así que el
  // movimiento a 6 decimales es imperceptible; con un APY real (mainnet/locks)
  // sí se ve correr.
  const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
  const blendRatePerMs = (blendBalance * (blendApy / 100)) / MS_PER_YEAR;
  const blendElapsed = blendUpdatedAt ? Math.max(0, clientNow - blendUpdatedAt) : 0;
  const blendLive = blendBalance + blendRatePerMs * blendElapsed;
  const liveBalance = activeDepositsTotalAmount + accruedInterest + blendLive;

  // Reglas para NO asustar con la plata:
  // - `blendPending`: primer load sin valor en cache todavía. No mostramos un
  //   total parcial (locks sin Blend) que después pega un salto: mostramos el
  //   spinner del saldo hasta saber el número completo.
  // - `blendFailed`: se agotaron los reintentos y no hay valor. En vez de
  //   mostrar un total MENOR al real en silencio, avisamos y ofrecemos
  //   reintentar. Si hay valor en cache (aunque viejo), se muestra ese y no se
  //   considera "failed".
  const blendPending = blendLoading && !blendPosition;
  const blendFailed = blendError && !blendPosition;
  const balanceLoading = (depositsLoading && !depositsData) || blendPending;
  // Con plata NUNCA redondeamos hacia arriba: truncamos a 6 decimales antes de
  // formatear. `toLocaleString` redondea, y eso hacía que el header mostrara
  // $6.000000 con $5.9999995 reales, contradiciendo el "Available" del retiro
  // (que trunca a 2 → $5.99) y aparentando un centavo perdido que no existe.
  // Truncar en ambos lados = misma dirección, nunca mostramos de más.
  const formattedBalance = truncateDecimals(liveBalance, 6).toLocaleString(undefined, {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });

  const displayName = profileData?.nickname || profileData?.fullName || '';

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
      <div className="w-full px-4 pt-3 pb-3 bg-primary rounded-g">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          {/* Avatar y campana llevan el mismo borde negro con la base más
              gruesa que <PressableButton>, y se hunden al presionarse: son
              botones (perfil / notificaciones), no adornos del header. */}
          <Link
            href="/profile"
            aria-label={t('home.stats.profileAria', 'Profile')}
            className="group relative shrink-0 transition active:translate-y-[2px]"
          >
            <VaquitaAvatarCircle
              config={profileData?.avatarConfig}
              seed={profileData?.walletAddress || walletAddress || ''}
              alt={t('home.stats.profileAlt', 'Profile')}
              className="h-16 w-16 border-2 border-black border-b-[6px] transition group-active:border-b-2"
            />
          </Link>

          <div className="flex flex-col min-w-0 flex-1 gap-1">
            {/* Saludo traducido + el username con @ en negrita. Si todavía no
                hay perfil no se renderiza para no reservar una línea vacía. */}
            {displayName && (
              <p className="text-xs text-black/70 leading-none truncate">
                {t('home.stats.greeting', 'Hi,')} <span className="font-bold text-black">@{displayName}</span>
              </p>
            )}
            {/* El saldo es la puerta al portafolio: se pinta como botón (crema
                sobre el naranja del header + borde negro, el idioma de botones
                de la app) para que se lea como algo que se toca, no como un
                dato. Antes abría el historial de movimientos; ese sigue
                accesible desde TotalDepositsButton y SavingsStats. */}
            <div className="flex items-center gap-1.5 self-start max-w-full">
              <PressableButton
                variant="cream"
                onClick={openPortfolioPanel}
                ariaLabel={t('home.stats.apyAria', 'Portfolio')}
                // w-fit + self-start: la pastilla se ajusta al saldo y crece con
                // él, alineada contra el mismo borde que el saludo.
                className="w-fit max-w-full self-start justify-start min-w-0 py-2"
              >
                {balanceLoading ? (
                  <Spinner size="sm" color="current" />
                ) : (
                  <span
                    data-tutorial="tutorial-balance"
                    className="text-xl font-bold text-black tabular-nums leading-none truncate"
                  >
                    {hideBalance ? '••••' : `$${formattedBalance}`}
                  </span>
                )}
              </PressableButton>
              {/* Nunca ocultamos que un saldo no se pudo confirmar: si Blend
                  falló y no hay valor en cache, el total mostrado NO incluye esa
                  parte, así que lo avisamos y dejamos reintentar en el acto en
                  vez de mentir con un número menor. */}
              {blendFailed ? (
                <button
                  type="button"
                  onClick={() => void refetchBlend()}
                  aria-label={t('home.stats.balanceRetry', 'Retry loading balance')}
                  title={t(
                    'home.stats.balanceSyncError',
                    "Couldn't load your Blend balance. Tap to retry.",
                  )}
                  className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-white/80 border border-black/20 text-amber-600 transition active:translate-y-[1px]"
                >
                  <FiAlertCircle className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            {/* OCULTOS A PROPÓSITO (2026-07-21): acá vivían dos chips bajo el
                saldo. El verde mostraba el APY base y abría <PortfolioPanel>;
                ese punto de entrada se mudó al propio saldo (arriba), así que
                el chip desapareció. El lila mostraba el boost de referidos
                (`apyBonus`, icono FiZap) y abría <ReferralsModal>: se decidió
                no exponer todavía esa pantalla. Ambos features siguen completos
                (`useApyByLockPeriod`, `useReferralBoost`, `ReferralsModal` en
                organisms/); para reactivarlos, volver a montar el chip acá con
                su estado y el render del modal al final. NO borrar esos
                archivos. */}
          </div>

          <Link
            href="/notifications"
            aria-label={t('notificationsCenter.bellAria', 'Notifications')}
            className="relative shrink-0 self-start w-8 h-8 rounded-full bg-white border border-black border-b-3 flex items-center justify-center transition active:border-b-[1px] active:translate-y-[2px]"
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
      {/* Aquí se montaba <ReferralsModal> (pantalla de referidos: ganancias,
          tiers de boost e invitar amigos). Oculta a propósito junto con su chip
          en la fila de stats — ver el comentario largo ahí para reactivarla. */}
    </div>
  );
};
