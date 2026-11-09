'use client';

import { useMapStore, useConfigStore } from '@/core-ui/stores';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBell, FiChevronLeft, FiHeadphones } from 'react-icons/fi';
import {
  useProfileData,
  useProfileExperience,
  useProfileRewards,
  useProfileStreak,
  useUnreadNotificationsCount,
} from '../../hooks';
import { GOLD_COIN, useElementPositionsStore } from '../../stores';
import { PageHeader } from '../molecules';
import { CircleIconButton } from '../molecules/CircleIconButton';
import { useModalPresence } from '../molecules/AppModal';
import { CoinsModal, ExperienceModal, StreakModal } from '../organisms';
import { VaquitaAvatarCircle } from '../avatar/VaquitaAvatar';
import { MapClock } from './MapClock';
import { MapQuickActions } from './MapQuickActions';
import { FOCUS_RING_CLASSES } from '../molecules/PressableButton';
import {
  HOME_TOUR_ANCHOR_HELP,
  HOME_TOUR_ANCHOR_PROFILE,
} from '../organisms/Tutorial/homeTourConfig';

/** Un tramo de la pastilla de racha/monedas/experiencia del header del mundo. */
const STAT_SEGMENT_CLASSES =
  'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-black tabular-nums transition ' +
  'hover:bg-[#F5FBFF] active:bg-black/10 ' +
  FOCUS_RING_CLASSES;

/**
 * `game` is the header of the 3D world (/world): back, the
 * streak/coins/stars pill and the quick actions row (explore, ranking, shop),
 * with the clock hanging under it. Off on the money dashboard (/home), which
 * shows the orange bar instead: avatar, greeting, notifications and help.
 */
export const HeaderStats = ({ game = false }: { game?: boolean }) => {
  const { t } = useTranslation();
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showCoinsModal, setShowCoinsModal] = useState(false);
  const [showExperienceModal, setShowExperienceModal] = useState(false);
  // Mantienen el modal montado mientras corre la animación de salida.
  const streakModalMounted = useModalPresence(showStreakModal);
  const coinsModalMounted = useModalPresence(showCoinsModal);
  const experienceModalMounted = useModalPresence(showExperienceModal);
  const { walletAddress } = useConfigStore();
  // El contador del badge de la campana. La query ya la refresca
  // <ListenNotificationsChanges> con el evento de Ably, así que el número se
  // actualiza solo.
  const unreadNotifications = useUnreadNotificationsCount();
  const isEditingMap = useMapStore((s) => s.isEditingMap);
  const setIsEditingMap = useMapStore((s) => s.setIsEditingMap);
  const setEditMode = useMapStore((s) => s.setEditMode);
  const setPickedItem = useMapStore((s) => s.setPickedItem);
  const setEditingObjectPosition = useMapStore((s) => s.setEditingObjectPosition);

  const { data: profileData } = useProfileData();
  const { data: streakData, isLoading: streakLoading } = useProfileStreak();
  const { data: profileRewards } = useProfileRewards();
  const { data: experienceData } = useProfileExperience();
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
      {/* The orange bar (avatar, greeting, notifications, help) belongs to the
          dashboard. Over the world (/world) it would repeat /home, so the world
          keeps only the game row and the floating column below it. */}
      {!game && (
      <div className="w-full px-4 pt-2 pb-2 bg-primary rounded-g">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          {/* Avatar y campana llevan el mismo borde negro con la base más
              gruesa que <PressableButton>, y se hunden al presionarse: son
              botones (perfil / notificaciones), no adornos del header. */}
          <Link
            href="/profile"
            data-tutorial={HOME_TOUR_ANCHOR_PROFILE}
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
              className="h-12 w-12 border-2 border-black border-b-4 transition group-active:border-b-2"
            />
          </Link>

          <div className="flex flex-col min-w-0 flex-1 gap-1">
            {/* Saludo traducido + el username con @ en negrita. Si todavía no
                hay perfil no se renderiza para no reservar una línea vacía. */}
            {displayName && (
              <div className="flex items-center gap-1 min-w-0">
                <p className="text-base text-black/80 leading-none truncate">
                  {t('home.stats.greeting', 'Hi,')} <span className="font-bold text-black">@{displayName}</span>
                </p>
              </div>
            )}
            {/* OCULTOS A PROPÓSITO (2026-07-21): acá vivían dos chips bajo el
                saldo. El verde mostraba el APY base y abría <PortfolioPanel>;
                ese punto de entrada se mudó al propio saldo (arriba), así que
                el chip desapareció. `useApyByLockPeriod` sigue completo: para
                reactivarlo, volver a montar el chip acá con su estado.

                El lila mostraba el boost de referidos (`apyBonus`, icono FiZap).
                Ese chip NO vuelve: el bonus se calcula pero ningún APY real lo
                aplica, así que anunciarlo sería prometer algo que el producto no
                cumple. La pantalla de referidos sí existe otra vez, sin promesas,
                en Perfil → Ajustes → Invitar amigos (<InviteFriendsPage>). */}
          </div>

          {/* Campana + soporte. El botón de instalar que iba arriba de estos
              dos se sacó del header; instalar la app sigue en Perfil → Ajustes. */}
          <div className="flex shrink-0 self-center flex-col items-end gap-2">
            <div className="flex items-center gap-2">
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
                data-tutorial={HOME_TOUR_ANCHOR_HELP}
                aria-label={t('concierge.buttonAria', 'Help Center')}
                className="relative shrink-0 w-8 h-8 rounded-full bg-white border border-black border-b-3 flex items-center justify-center transition active:border-b-[1px] active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                <FiHeadphones className="w-4 h-4 text-black" />
              </Link>
            </div>
          </div>
        </div>
      </div>
      )}
      {/* El mundo es una pantalla propia (sin barra inferior): se entra desde
          el tablero y se sale con el back. Un solo bloque naranja (bg-primary),
          el mismo del header del perfil de otro usuario, con dos filas:

          1. back + racha/monedas/experiencia. Los tres números van
             juntos en UNA pastilla partida en tres, cada tramo un botón que
             abre su modal; como tres chips sueltos más la fila de accesos de
             abajo, el header se comía el mapa.
          2. explorar, ranking y tienda.

          El padding de arriba suma el safe-area para quedar debajo del notch
          en la app instalada. */}
      {game && (
        <div className="relative z-20 border-b border-black/10 bg-primary px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+12px)]">
          <div className="max-w-xl mx-auto flex flex-col gap-2.5">
            {/* Sin título: back a la izquierda, pastilla a la derecha. */}
            <div className="flex items-center justify-between gap-2.5">
              <div>
                <CircleIconButton
                  href="/home"
                  variant="white"
                  ariaLabel={t('common.back', 'Back')}
                  icon={<FiChevronLeft className="w-4 h-4" />}
                />
              </div>
              <div className="flex shrink-0 items-stretch divide-x divide-black/15 overflow-hidden rounded-full border border-black border-b-2 bg-white">
                <button
                  type="button"
                  onClick={() => setShowStreakModal(true)}
                  aria-label={t('home.stats.streakAlt', 'Streak')}
                  className={STAT_SEGMENT_CLASSES + ' pl-3'}
                >
                  {streakLoading && !streakData ? (
                    <Spinner size="sm" color="current" />
                  ) : (
                    <>
                      <Image
                        src="/icons/global/streak_face.png"
                        alt=""
                        width={18}
                        height={18}
                        className="object-contain"
                        priority
                        style={hasActiveStreak ? {} : { filter: 'grayscale(100%)' }}
                      />
                      <span>{totalStreak}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowCoinsModal(true)}
                  aria-label={t('home.stats.goldCoinAlt', 'Gold Coin')}
                  className={STAT_SEGMENT_CLASSES}
                >
                  {/* La ref del destino de la animación de monedas va en el
                      contenido: el centro del ícono es mejor blanco que el del
                      tramo entero. */}
                  <span ref={setGoldCoinRef} className="flex items-center gap-1.5">
                    <Image src="/icons/global/coin.png" alt="" width={18} height={18} className="object-contain" priority />
                    <span>{goldCoins}</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowExperienceModal(true)}
                  aria-label={t('home.stats.experienceAlt', 'Experience')}
                  className={STAT_SEGMENT_CLASSES + ' pr-3'}
                >
                  <Image src="/icons/global/star.png" alt="" width={18} height={18} className="object-contain" priority />
                  <span>{Math.floor(experience).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </button>
              </div>
            </div>

            <MapQuickActions />
          </div>
        </div>
      )}

      {/* El reloj cuelga del borde inferior del header: sus cuerdas miden 9px
          (ver <MapClockCard>), así que ese es exactamente el offset. El cofre
          diario ya no vive acá: en móvil es el botón grande de abajo a la
          derecha (lo monta <HomePage>), también en escritorio. */}
      {game && (
        <div className="absolute left-0 right-0 top-full mt-[9px] px-3 z-20 pointer-events-none">
          <div className="max-w-xl mx-auto flex items-start">
            <div className="pointer-events-auto">
              <MapClock />
            </div>
          </div>
        </div>
      )}

      {streakModalMounted && <StreakModal open={showStreakModal} onOpenChange={() => setShowStreakModal(false)} />}
      {coinsModalMounted && (
        <CoinsModal open={showCoinsModal} onOpenChange={() => setShowCoinsModal(false)} coins={goldCoins} />
      )}
      {experienceModalMounted && (
        <ExperienceModal
          open={showExperienceModal}
          onOpenChange={() => setShowExperienceModal(false)}
          experience={experience}
        />
      )}
    </div>
  );
};
