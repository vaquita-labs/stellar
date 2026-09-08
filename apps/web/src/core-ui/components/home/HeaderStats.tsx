'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { useMapStore, useConfigStore } from '@/core-ui/stores';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiBell, FiChevronRight, FiHeadphones } from 'react-icons/fi';
import {
  usePassiveUsdc,
  useDepositsComplete,
  useProfileData,
  useProfileExperience,
  useProfileRewards,
  useProfileStreak,
  useUnreadNotificationsCount,
} from '../../hooks';
import { GOLD_COIN, useElementPositionsStore, useHideBalance, usePendingCreditStore } from '../../stores';
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
import { AccrualTerm, LiveBalance } from './LiveBalance';
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
  // El contador del badge de la campana. La query ya la refresca
  // <ListenNotificationsChanges> con el evento de Ably, así que el número se
  // actualiza solo.
  const unreadNotifications = useUnreadNotificationsCount();
  const hideBalance = useHideBalance();
  // Después de comprar con moneda local la plata tarda en acreditarse, y hasta
  // que entra, el saldo de acá muestra un número que ya sabemos viejo. Mientras
  // dura esa espera la pastilla parpadea: no es un error ni un saldo cargando,
  // es plata en camino. Se apaga cuando la plata llega y `AutoInvest` ofrece
  // invertirla, o al vencer la ventana del proveedor: ese final feliz puede no
  // pasar nunca (wallet externa, prompt en opt-out, un pago que nadie acredita)
  // y un saldo titilando para siempre sería peor que uno quieto.
  const pendingUntil = usePendingCreditStore((s) => s.pendingUntil);
  const clearPendingCredit = usePendingCreditStore((s) => s.clearPendingCredit);
  const balancePending = pendingUntil != null;
  useEffect(() => {
    if (pendingUntil == null) return;
    const timer = setTimeout(clearPendingCredit, Math.max(0, pendingUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [pendingUntil, clearPendingCredit]);
  const isEditingMap = useMapStore((s) => s.isEditingMap);
  const setIsEditingMap = useMapStore((s) => s.setIsEditingMap);
  const setEditMode = useMapStore((s) => s.setEditMode);
  const setPickedItem = useMapStore((s) => s.setPickedItem);
  const setEditingObjectPosition = useMapStore((s) => s.setEditingObjectPosition);

  const { data: profileData } = useProfileData();
  const { data: streakData, isLoading: streakLoading } = useProfileStreak();
  const { data: depositsData, isLoading: depositsLoading } = useDepositsComplete(walletAddress);
  // Posición de depósito directo a Blend (on-chain). Es el nivel base del
  // portafolio: entra al total junto con los locks de Vaquita. Acá se usa la
  // versión que NO tickea: el saldo se proyecta en vivo dentro de <LiveBalance>,
  // fuera del render (ver el comentario del saldo más abajo).
  const {
    data: blendPosition,
    isLoading: blendLoading,
    isError: blendError,
    refetch: refetchBlend,
    settled: blendSettled,
    ratePerMs: blendRatePerMs,
    updatedAt: blendUpdatedAt,
  } = usePassiveUsdc(walletAddress);
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
  // Total = locks (capital + interés devengado en vivo) + la posición pasiva
  // (nivel base, líquido: vault de DeFindex o Blend según el flag). Se parte en
  // dos: lo QUIETO va en `balanceBase` y lo que avanza solo en `liveTerms`, que
  // <LiveBalance> proyecta y pinta en cada tick sin re-renderizar el header. El
  // término pasivo sale de la MISMA tasa que usa el "Available" del retiro, así
  // ambos corren juntos y muestran el mismo número (ver `usePassiveUsdc`).
  const balanceBase = activeDepositsTotalAmount + blendSettled;
  const liveTerms = useMemo<AccrualTerm[]>(() => {
    // Cada depósito reporta cuánto rinde por milisegundo, así que el contador
    // avanza en el cliente sin volver a pedirle nada al servidor.
    const terms = activeDeposits.flatMap<AccrualTerm>((d) => {
      const earnings = earningsById[d.id];
      if (!earnings) return [];
      // Igual que en la card: la lista viene cacheada, así que el "ahora" real
      // se deriva del reloj del servidor + lo transcurrido desde el fetch. Ese
      // desfasaje se hornea en el ancla, y así el contador puede leer el reloj
      // del cliente y nada más.
      const skew = d.serverTimestamp && d.fetchedAtTimestamp ? d.fetchedAtTimestamp - d.serverTimestamp : 0;
      return [{ ratePerMs: earnings.ratePerMs, maxInterest: earnings.maxInterest, anchor: d.createdTimestamp + skew }];
    });
    // Blend devenga desde el momento del fetch y no tiene vencimiento: sin tope.
    if (blendUpdatedAt) {
      terms.push({ ratePerMs: blendRatePerMs, maxInterest: Infinity, anchor: blendUpdatedAt });
    }
    return terms;
  }, [activeDeposits, earningsById, blendRatePerMs, blendUpdatedAt]);

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

  const displayName = profileData?.nickname || profileData?.fullName || '';

  const totalStreak = (streakData?.yesterdayStreak || 0) + (streakData?.todayStreak ? 1 : 0);
  const hasActiveStreak = !!streakData?.todayStreak;

  const goldCoins = profileRewards?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;
  const experience = experienceData?.experience ?? 0;

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
            className="group relative shrink-0 transition active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black rounded-full"
          >
            {/* Sin chevron encima: el borde grueso que se hunde al tocarlo ya
                dice que es un botón, y la insignia le comía la esquina a la
                cara. */}
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
              <p className="text-xs text-black/80 leading-none truncate">
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
                // w-fit: la pastilla ABRAZA el número (no llena todo el ancho, que
                // dejaba un vacío enorme adentro con saldos cortos). Como ahora
                // SIEMPRE mostramos los 7 decimales, el número es más largo y de
                // ancho casi constante, así que la pastilla queda snug y estable.
                // Alineada a la izquierda, mismo borde que el saludo.
                className={`w-fit max-w-full self-start justify-start min-w-0 py-2${balancePending ? ' animate-pulse' : ''}`}
              >
                {balanceLoading ? (
                  <Spinner size="sm" color="current" />
                ) : (
                  <span
                    data-tutorial="tutorial-balance"
                    className="font-bold text-black tabular-nums leading-none truncate"
                  >
                    {hideBalance ? (
                      <span className="text-xl">••••</span>
                    ) : (
                      <LiveBalance base={balanceBase} terms={liveTerms} />
                    )}
                  </span>
                )}
                {/* La pastilla es crema clara con un número adentro: sin esto se
                    lee como un campo de texto, no como el acceso al portafolio.
                    El chevron es la señal de "esto abre algo". */}
                <FiChevronRight aria-hidden className="h-5 w-5 shrink-0 text-black/60" />
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

          {/* Campana + soporte: los dos únicos accesos del encabezado, mismo
              botón redondo. La campana es el ÚNICO punto de entrada a
              /notifications — sin ella el feed existe pero no se puede
              alcanzar desde la app. */}
          <div className="flex shrink-0 self-start items-center gap-2">
            <Link
              href="/notifications"
              aria-label={t('notificationsCenter.bellAria', 'Notifications')}
              className="relative shrink-0 w-8 h-8 rounded-full bg-white border border-black border-b-3 flex items-center justify-center transition active:border-b-[1px] active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              <FiBell className="w-4 h-4 text-black" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 border border-white text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </Link>

            <Link
              href="/concierge"
              aria-label={t('concierge.buttonAria', 'Help Center')}
              className="relative shrink-0 w-8 h-8 rounded-full bg-white border border-black border-b-3 flex items-center justify-center transition active:border-b-[1px] active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              <FiHeadphones className="w-4 h-4 text-black" />
            </Link>
          </div>
        </div>
      </div>

      {/* Racha, monedas y experiencia ABREN cada uno su modal. Como fila de
          números sueltos se leían como un panel de datos, así que cada uno es
          un <PressableButton> chip: el mismo borde, el mismo hundido y el mismo
          anillo de foco que cualquier otro botón de la app.

          La banda va de borde a borde, igual que el bloque naranja de arriba:
          el FONDO ocupa todo el ancho y solo el contenido se centra en
          `max-w-xl`. En móvil da lo mismo (la pantalla es más angosta que ese
          tope), pero en escritorio la barra dejaba de tocar los bordes y
          quedaba como una isla flotante en medio del mapa. Sigue translúcida
          porque es de donde cuelga el cartel del reloj (ver <MapClockCard>,
          cuyas cuerdas suben hasta este borde inferior).

          Offsets en px fijos (no las clases rem de Tailwind) para que la
          distancia al bloque naranja sea la misma en todos los dispositivos,
          aunque el usuario tenga el tamaño de fuente del sistema agrandado. */}
      <div className="absolute left-0 right-0 -bottom-[36px] z-20 pointer-events-none">
        <div className="bg-white/40 backdrop-blur-md pointer-events-auto">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2 px-2 py-1.5">
            <PressableButton
              variant="white"
              size="chip"
              onClick={() => setShowStreakModal(true)}
              ariaLabel={t('home.stats.streakAlt', 'Streak')}
              className="flex-1"
            >
              {streakLoading && !streakData ? (
                <Spinner size="sm" color="current" />
              ) : (
                <>
                  <Image
                    src="/icons/global/streak_face.png"
                    alt=""
                    width={20}
                    height={20}
                    className="object-contain"
                    priority
                    style={hasActiveStreak ? {} : { filter: 'grayscale(100%)' }}
                  />
                  <span className="text-xs font-bold text-black tabular-nums">{totalStreak}</span>
                </>
              )}
            </PressableButton>

            <PressableButton
              variant="white"
              size="chip"
              onClick={() => setShowCoinsModal(true)}
              ariaLabel={t('home.stats.goldCoinAlt', 'Gold Coin')}
              className="flex-1"
            >
              {/* La ref del destino de la animación de monedas va en el contenido,
                  no en el botón: <PressableButton> no reenvía refs y el centro del
                  ícono es mejor blanco que el centro del chip entero. */}
              <span ref={setGoldCoinRef} className="flex items-center gap-2">
                <Image src="/icons/global/coin.png" alt="" width={20} height={20} className="object-contain" priority />
                <span className="text-xs font-bold text-black tabular-nums">{goldCoins}</span>
              </span>
            </PressableButton>

            <PressableButton
              variant="white"
              size="chip"
              onClick={() => setShowExperienceModal(true)}
              ariaLabel={t('home.stats.experienceAlt', 'Experience')}
              className="flex-1"
            >
              <Image src="/icons/global/star.png" alt="" width={20} height={20} className="object-contain" priority />
              <span className="text-xs font-bold text-black tabular-nums">
                {Math.floor(experience).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </PressableButton>
          </div>
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
