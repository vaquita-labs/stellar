'use client';

import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useAnalytics, useDeposits } from '../../hooks';
import { EditionMode, useGameClockSynced, useLoading, useMapStore, useModalQueueStore, useConfigStore } from '../../stores';
import { WorldType } from '../../types';
import { useModalPresence } from '../molecules/AppModal';
import { BankAPYModal, CoinAnimation, DepositPanel, HomeTour, PushNudge, TutorialModal } from '../organisms';
import { WorldMap } from '../templates';
import { AutoInvest } from './AutoInvest';
import { BackgroundMusic } from './BackgroundMusic';
import { BadgeClaimGate } from './BadgeClaimGate';
import { EditPanels } from './edit';
import { HeaderStats } from './HeaderStats';
import { HomeSkeleton } from './HomeSkeleton';
import { PlaceModeHint } from './PlaceModeHint';

export function HomePage() {
  const { walletAddress, lockPeriod, network } = useConfigStore();
  const { isLoading } = useDeposits(walletAddress);
  const { trackUserAction } = useAnalytics();
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false);
  const isEditingMap = useMapStore((store) => store.isEditingMap);
  const setIsEditingMap = useMapStore((store) => store.setIsEditingMap);
  const setEditMode = useMapStore((store) => store.setEditMode);
  const setEditingObjectPosition = useMapStore((store) => store.setEditingObjectPosition);

  const [showBankAPYModal, setShowBankAPYModal] = useState(false);
  const bankAPYModalMounted = useModalPresence(showBankAPYModal);
  const [coinAnimationTarget, setCoinAnimationTarget] = useState<{ x: number; y: number } | null>(null);

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

  // La hora del juego es estado del que depende toda la escena (reloj, y en el
  // futuro la luz). Hasta que el servidor la confirma no se renderiza el mapa
  // ni el reloj: se muestra el loader en vez de una hora provisional que después
  // cambie. useGameClockSync (en Providers) hace el fetch a /api/v1/time.
  const clockReady = useGameClockSynced();

  // El pedido de permiso de notificaciones es el primero de la cola y su turno
  // se toma antes que los otros tres. Va adelante aunque no sea la decisión más
  // grande porque es el único pedido que VENCE: el prompt nativo necesita un
  // gesto del usuario y el sistema operativo lo ofrece una sola vez, así que
  // taparlo no lo posterga, lo pierde. Quien lo LIBERA es `PushNudge`.
  const setPushNudgeSettled = useModalQueueStore((s) => s.setPushNudgeSettled);
  useEffect(() => {
    setPushNudgeSettled(false);
    return () => setPushNudgeSettled(true);
  }, [setPushNudgeSettled]);

  // El turno de la cola de modales se TOMA acá, al entrar al home, y no cuando
  // monta `AutoInvest`: ese vive debajo del gate de `clockReady` de más abajo,
  // o sea detrás de un GET /time. Hasta que el reloj sincroniza, el gate de las
  // notas de versión (en el layout, o sea un ancestro) ve el default `true` del
  // store y ya alcanzó a mostrar la nota — que después desaparecía sola cuando
  // `AutoInvest` finalmente tomaba el turno. Quien lo LIBERA sigue siendo
  // `AutoInvest`, que es el único que sabe si hay dinero ocioso que ofrecer.
  const setVaultPromptSettled = useModalQueueStore((s) => s.setVaultPromptSettled);
  useEffect(() => {
    setVaultPromptSettled(false);
    return () => setVaultPromptSettled(true);
  }, [setVaultPromptSettled]);

  // El turno del tour se toma acá por la misma razón: `HomeTour` monta debajo
  // del gate de `clockReady`, o sea detrás de un GET /time, y hasta entonces las
  // notas de versión ya alcanzarían a abrirse encima de los coach marks. Quien
  // lo LIBERA es `HomeTour`, que es el único que sabe si el usuario todavía
  // necesita el tour.
  const setHomeTourSettled = useModalQueueStore((s) => s.setHomeTourSettled);
  useEffect(() => {
    setHomeTourSettled(false);
    return () => setHomeTourSettled(true);
  }, [setHomeTourSettled]);

  // Y el del badge pendiente, por lo mismo: `BadgeClaimGate` monta debajo del
  // gate de `clockReady`, y hasta entonces las notas de versión ya alcanzarían
  // a abrirse antes que la hoja de reclamo. Quien lo LIBERA es el gate, que es
  // el único que sabe si hay un badge esperando.
  const setBadgeClaimSettled = useModalQueueStore((s) => s.setBadgeClaimSettled);
  useEffect(() => {
    setBadgeClaimSettled(false);
    return () => setBadgeClaimSettled(true);
  }, [setBadgeClaimSettled]);

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
    return <HomeSkeleton />;
  }

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden min-h-0">
      {/* Primero de la cola, y montado acá y no en el layout privado: ese layout
          no se desmonta al navegar, así que la hoja terminaba apareciendo sobre
          /profile. */}
      <PushNudge />
      <AutoInvest />
      <BadgeClaimGate />
      <HeaderStats />
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
                <WorldMap walletAddress={walletAddress} worldType={WorldType.FOREST} isAvailable={true} />
              </div>
            </div>
          </div>

          <DepositPanel />

          <EditPanels open={isEditingMap} onOpenChange={handleEditPanelsClose} />
        </div>
      )}

      {/* Mounted below the `clockReady` gate on purpose: the tour measures the
          real buttons, and above the gate the map and the action row do not
          exist yet, so every anchor would resolve to nothing. */}
      <HomeTour />

      {isTutorialModalOpen && <TutorialModal isOpen={isTutorialModalOpen} onClose={() => setIsTutorialModalOpen(false)} />}

      {bankAPYModalMounted && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}

      {/* {showStreakModal && <StreakModal open={showStreakModal} onOpenChange={() => setShowStreakModal(false)} />} */}

      {/* {showSilverModal && <ItemsModal open={showSilverModal} onOpenChange={() => setShowSilverModal(false)} />} */}
    </div>
  );
}
