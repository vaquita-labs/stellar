'use client';

import Image from 'next/image';
import React, { useCallback, useEffect, useState } from 'react';
import { useAnalytics, useDeposits } from '../../hooks';
import {
  EditionMode,
  useGameClockSynced,
  useLoading,
  useMapStore,
  useReserveAutoModalSlot,
  useConfigStore,
} from '../../stores';
import { WorldType } from '../../types';
import { useModalPresence } from '../molecules/AppModal';
import { WorldLoader } from '../molecules/WorldLoader';
import { BankAPYModal, CoinAnimation, DepositPanel, HomeTour, PushNudge, TutorialModal } from '../organisms';
import { WorldMap } from '../templates';
import { AutoInvest } from './AutoInvest';
import { BackgroundMusic } from './BackgroundMusic';
import { BadgeClaimGate } from './BadgeClaimGate';
import { DailyRewardChest } from './DailyRewardChest';
import { EditPanels } from './edit';
import { HeaderStats } from './HeaderStats';
import { HomeDashboard } from './HomeDashboard';
import { HomeSkeleton } from './HomeSkeleton';
import { PlaceModeHint } from './PlaceModeHint';

/**
 * What this screen shows:
 * - `dashboard` (/home): the money dashboard, no 3D world. The world was taken
 *   off /home (2026-10-31) because it costs too much to boot on every launch.
 * - `world` (/world): the 3D world (`WorldMap`: WebGL canvas, map objects, the
 *   vaquita, day clock) as a screen of its own: back + title header with
 *   streak/coins/stars and the quick actions, the daily chest as a big button
 *   bottom right, and no bottom bar. Only the user who opens it pays for the
 *   canvas.
 *
 * The auto-opening sheets (push nudge, auto-invest, badge claim, tour) stay on
 * the dashboard only: they are the welcome of the app, and mounting them on
 * both screens would show the same sheet twice.
 */
export type HomePageVariant = 'dashboard' | 'world';

/** Longest the world's loading screen stays up waiting for the map to report ready. */
const WORLD_LOADER_MAX_MS = 15000;

export function HomePage({ variant = 'dashboard' }: { variant?: HomePageVariant }) {
  const isWorld = variant === 'world';
  const { walletAddress, network } = useConfigStore();
  const { isLoading } = useDeposits(walletAddress);
  const { trackUserAction } = useAnalytics();

  // Track when user has wallet connected
  useEffect(() => {
    if (walletAddress) {
      trackUserAction('wallet_connected', {
        walletAddress: walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4),
        network: network?.networkName || null,
      });
    }
  }, [walletAddress, network?.networkName, trackUserAction]);

  useLoading('deposits', isLoading);

  // The four modals this home owns reserve their place in the queue HERE, above
  // the `clockReady` gate below. The components that draw them mount under that
  // gate, one GET /time away, and until the clock syncs the version notes — which
  // live in the layout, an ancestor — see an empty queue and get as far as
  // showing a note and taking it away again. Each one gives its place back once
  // it knows whether it is showing; the order between them is in [[auto-modals]].
  //
  // Only the dashboard owns them (see the variant note above): the world screen
  // mounts none of these sheets, so it must not hold places it never gives back.
  return isWorld ? <HomeScreen variant="world" /> : <DashboardHome />;
}

/** The dashboard also owns the four auto-modal places; the world screen does not. */
function DashboardHome() {
  useReserveAutoModalSlot('push-nudge');
  useReserveAutoModalSlot('home-tour');
  useReserveAutoModalSlot('vault-prompt');
  useReserveAutoModalSlot('badge-claim');
  return <HomeScreen variant="dashboard" />;
}

function HomeScreen({ variant }: { variant: HomePageVariant }) {
  const isWorld = variant === 'world';
  const { walletAddress, lockPeriod } = useConfigStore();
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false);
  const isEditingMap = useMapStore((store) => store.isEditingMap);
  const setIsEditingMap = useMapStore((store) => store.setIsEditingMap);
  const setEditMode = useMapStore((store) => store.setEditMode);
  const setEditingObjectPosition = useMapStore((store) => store.setEditingObjectPosition);

  const [showBankAPYModal, setShowBankAPYModal] = useState(false);
  const bankAPYModalMounted = useModalPresence(showBankAPYModal);
  const [coinAnimationTarget, setCoinAnimationTarget] = useState<{ x: number; y: number } | null>(null);

  // La hora del juego es estado del que depende toda la escena (reloj, y en el
  // futuro la luz). Hasta que el servidor la confirma no se renderiza el mapa
  // ni el reloj: se muestra el loader en vez de una hora provisional que después
  // cambie. useGameClockSync (en Providers) hace el fetch a /api/v1/time.
  const clockReady = useGameClockSynced();

  // The world boots in stages (bundle, clock, deposits, WebGL context, map
  // data) and each one used to show: an empty sea first, the island popping in
  // after. <WorldLoader> stays over the whole screen until the map says it is
  // drawn, then fades out. The timeout is the way out if that signal never
  // comes (a WebGL context that fails shows its own message underneath).
  const [worldReady, setWorldReady] = useState(false);
  const [worldLoaderGone, setWorldLoaderGone] = useState(false);
  const handleWorldReady = useCallback(() => setWorldReady(true), []);
  const handleWorldLoaderGone = useCallback(() => setWorldLoaderGone(true), []);
  useEffect(() => {
    if (!isWorld || worldReady) return;
    const id = setTimeout(() => setWorldReady(true), WORLD_LOADER_MAX_MS);
    return () => clearTimeout(id);
  }, [isWorld, worldReady]);

  const handleCoinAnimationComplete = () => {
    setCoinAnimationTarget(null);
  };

  const handleEditPanelsClose = () => {
    setIsEditingMap(false);
    setEditMode(null);
    setEditingObjectPosition(null);
  };

  // Gate: sin la hora confirmada no se muestra el mapa/reloj (misma pantalla de
  // carga que usan ConfigProvider / ProfileDataProvider). Nunca se queda
  // colgado acá: si GET /time falla, GameClockSync marca el reloj como listo
  // con la hora local (fallbackGameClock) y sigue reintentando por atrás.
  if (!clockReady) {
    return isWorld ? <WorldLoader /> : <HomeSkeleton />;
  }

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden min-h-0">
      {/* Primero de la cola, y montado acá y no en el layout privado: ese layout
          no se desmonta al navegar, así que la hoja terminaba apareciendo sobre
          /profile. */}
      {!isWorld && (
        <>
          <PushNudge />
          <AutoInvest />
          <BadgeClaimGate />
        </>
      )}
      <HeaderStats game={isWorld} />
      <PlaceModeHint />
      {/* <BackgroundMusic /> */}
      <CoinAnimation
        key={JSON.stringify(coinAnimationTarget ?? {})}
        targetPosition={coinAnimationTarget}
        onComplete={handleCoinAnimationComplete}
        coinCount={1}
      />
      {/* create a component that shows total days  */}
      {lockPeriod !== null && lockPeriod !== undefined && (
        <div className="relative flex-1 flex items-stretch min-h-0">
          <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
            {/* The map is mounted once and stays put: it is the screen itself,
                not a panel that slides in and out. */}
            <div className="h-full w-full flex flex-row">
              <div className="h-full w-full shrink-0">
                {isWorld ? (
                  <WorldMap
                    walletAddress={walletAddress}
                    worldType={WorldType.FOREST}
                    isAvailable={true}
                    onReady={handleWorldReady}
                  />
                ) : (
                  // Sin el mundo 3D, el tablero de la plata (ver HomeDashboard),
                  // con Retirar y Depositar debajo del saldo en vez de flotando.
                  <HomeDashboard actions={<DepositPanel inline />} />
                )}
              </div>
            </div>
          </div>

          {/* The daily chest, as the big button of the screen: bottom right,
              where the thumb is, on every screen size. Out of the way while
              the shop panels own the bottom. */}
          {isWorld && !isEditingMap && (
            <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+16px)] right-4 z-20">
              <DailyRewardChest />
            </div>
          )}

          <EditPanels open={isEditingMap} onOpenChange={handleEditPanelsClose} />
        </div>
      )}

      {isWorld && !worldLoaderGone && <WorldLoader overlay leaving={worldReady} onGone={handleWorldLoaderGone} />}

      {/* Mounted below the `clockReady` gate on purpose: the tour measures the
          real buttons, and above the gate the map and the action row do not
          exist yet, so every anchor would resolve to nothing. */}
      {!isWorld && <HomeTour />}

      {isTutorialModalOpen && <TutorialModal isOpen={isTutorialModalOpen} onClose={() => setIsTutorialModalOpen(false)} />}

      {bankAPYModalMounted && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}

      {/* {showStreakModal && <StreakModal open={showStreakModal} onOpenChange={() => setShowStreakModal(false)} />} */}

      {/* {showSilverModal && <ItemsModal open={showSilverModal} onOpenChange={() => setShowSilverModal(false)} />} */}
    </div>
  );
}
