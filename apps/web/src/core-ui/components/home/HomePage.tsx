'use client';

import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useAnalytics, useDeposits } from '../../hooks';
import { EditionMode, useGameClockSynced, useLoading, useMapStore, useModalQueueStore, useConfigStore } from '../../stores';
import { WorldType } from '../../types';
import { useModalPresence } from '../molecules/AppModal';
import { BankAPYModal, CoinAnimation, DepositPanel, TutorialModal } from '../organisms';
import { WorldMap } from '../templates';
import { AutoInvest } from './AutoInvest';
import { BackgroundMusic } from './BackgroundMusic';
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

  // El turno de la cola de modales se TOMA acá, al entrar al home, y no cuando
  // monta `AutoInvest`: ese vive debajo del gate de `clockReady` de más abajo,
  // o sea detrás de un GET /time. Hasta que el reloj sincroniza, el gate de las
  // notas de versión (en el layout, o sea un ancestro) ve el default `true` del
  // store y ya alcanzó a mostrar la nota — que después desaparecía sola cuando
  // `AutoInvest` finalmente tomaba el turno. Quien lo LIBERA sigue siendo
  // `AutoInvest`, que es el único que sabe si hay plata ociosa que ofrecer.
  const setVaultPromptSettled = useModalQueueStore((s) => s.setVaultPromptSettled);
  useEffect(() => {
    setVaultPromptSettled(false);
    return () => setVaultPromptSettled(true);
  }, [setVaultPromptSettled]);

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
      <AutoInvest />
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

      {isTutorialModalOpen && <TutorialModal isOpen={isTutorialModalOpen} onClose={() => setIsTutorialModalOpen(false)} />}

      {bankAPYModalMounted && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}

      {/* {showStreakModal && <StreakModal open={showStreakModal} onOpenChange={() => setShowStreakModal(false)} />} */}

      {/* {showSilverModal && <ItemsModal open={showSilverModal} onOpenChange={() => setShowSilverModal(false)} />} */}
    </div>
  );
}
