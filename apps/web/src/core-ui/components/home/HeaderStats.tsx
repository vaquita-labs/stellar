'use client';

import { useMapStore, useConfigStore } from '@/core-ui/stores';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBell, FiHeadphones } from 'react-icons/fi';
import {
  useProfileData,
  useProfileExperience,
  useProfileRewards,
  useProfileStreak,
  useUnreadNotificationsCount,
} from '../../hooks';
import { GOLD_COIN, useElementPositionsStore } from '../../stores';
import { PageHeader } from '../molecules';
import { useModalPresence } from '../molecules/AppModal';
import { CoinsModal, ExperienceModal, InstallButton, StreakModal } from '../organisms';
import { VaquitaAvatarCircle } from '../avatar/VaquitaAvatar';
import { DailyRewardChest } from './DailyRewardChest';
import { MapClock } from './MapClock';
import { MapQuickActions } from './MapQuickActions';
import { PressableButton } from '../molecules/PressableButton';
import {
  HOME_TOUR_ANCHOR_HELP,
  HOME_TOUR_ANCHOR_PROFILE,
} from '../organisms/Tutorial/homeTourConfig';

/**
 * `game` turns on the parts of the header that belong to the game and the map:
 * the balance pill, the streak/coins/stars row and the floating column with the
 * clock, quick actions and the daily chest. On over the 3D world (/apps); off on
 * the money dashboard (/home), which shows the balance itself. What is always
 * there is the avatar, the greeting, install, notifications and help.
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
          dashboard. Over the world (/apps) it would repeat /home, so the world
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

          {/* Instalar + campana + soporte, en columna. El botón de instalar va
              ARRIBA de los dos redondos a propósito: instalar la app es lo que
              habilita las notificaciones push (en iOS no llega ninguna hasta
              que está en la pantalla de inicio), así que es la acción que más
              queremos que se vea. Se borra solo cuando ya está instalada —
              adentro de la app instalada un botón de instalar se lee roto. */}
          <div className="flex shrink-0 self-center flex-col items-end gap-2">
            <InstallButton />

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
      {/* Over the world there is no orange bar for the game row to hang from, so
          this spacer is what keeps it off the top edge (and below the notch in
          the installed app). The row and the floating column are positioned
          from the bottom of this wrapper, so both move down together. */}
      {game && <div aria-hidden className="h-[calc(env(safe-area-inset-top)+12px)]" />}

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
      {game && (
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
      )}

      {/* Fila flotante sobre el cielo, anclada al borde inferior del bloque
          naranja (top-full) con un offset en px fijos: 36px que ocupa el pill
          de stats + 4px de aire. Reloj a la izquierda (el ciclo de luz del mapa
          sigue esta misma hora) y accesos rápidos + cofre a la derecha, ambos
          en el mismo contenedor centrado max-w-xl para que arranquen a la misma
          altura y a la misma distancia del naranja en cualquier pantalla.
          La columna derecha es solo móvil: en escritorio vive en el sidebar. */}
      {game && (
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
