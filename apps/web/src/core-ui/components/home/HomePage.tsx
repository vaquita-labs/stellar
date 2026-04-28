'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useAnalytics, useDeposits } from '../../hooks';
import { EditionMode, useLoading, useMapStore, useNetworkConfigStore } from '../../stores';
import { WorldType } from '../../types';
import { BankAPYModal, CoinAnimation, DepositPanel, TutorialModal } from '../organisms';
import { WorldMap } from '../templates';
import { BackgroundMusic } from './BackgroundMusic';
import { EditPanels } from './edit';
import { HeaderStats } from './HeaderStats';
import { RewardCoinsButton } from './RewardCoinsButton';

export function HomePage() {
  const { walletAddress, lockPeriod, network, token } = useNetworkConfigStore();
  const { isLoading } = useDeposits(walletAddress);
  const { trackPageView, trackUserAction } = useAnalytics();
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false);
  const [isEditingMap, setIsEditingMap] = useState(false);
  const setEditMode = useMapStore((store) => store.setEditMode);

  const [showBankAPYModal, setShowBankAPYModal] = useState(false);
  const [coinAnimationTarget, setCoinAnimationTarget] = useState<{ x: number; y: number } | null>(null);

  // Track page view when component mounts
  useEffect(() => {
    trackPageView('home');
  }, [trackPageView]);

  // Track when user has wallet connected
  useEffect(() => {
    if (walletAddress) {
      trackUserAction('wallet_connected', {
        walletAddress: walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4),
        network: network?.name || null,
      });
    }
  }, [walletAddress, network?.name, trackUserAction]);

  useLoading('deposits', isLoading);

  const handleCoinAnimationComplete = () => {
    setCoinAnimationTarget(null);
  };

  const handleEditMapToggle = () => {
    if (isEditingMap) {
      // Si está editando, guardar cambios y cerrar modal
      setIsEditingMap(false);
      setEditMode(null);
      trackUserAction('map_saved');
    } else {
      // Si no está editando, entrar en modo edición y abrir modal
      setIsEditingMap(true);
      setEditMode(EditionMode.SELECT);
      trackUserAction('map_edit_started');
    }
  };

  const handleEditPanelsClose = () => {
    setIsEditingMap(false);
    setEditMode(null);
  };

  return (
    <div className="h-full w-full flex flex-col relative">
      <HeaderStats />
      <RewardCoinsButton />
      {/* <BackgroundMusic /> */}
      {/* Botón de Editar Mapa / Cerrar */}
      {isEditingMap ? (
        <button
          id="close-edit-button"
          className="absolute top-20 md:top-12 right-3 md:right-2 z-10 w-12 h-12 md:w-20 md:h-20 flex items-center justify-center rounded-lg bg-transparent"
          onClick={handleEditMapToggle}
        >
          <Image width={40} height={40} src="/icons/summary/save_map.png" alt="Save" />
        </button>
      ) : (
        <button
          id="edit-map-button"
          className="absolute top-20 md:top-12 right-3 md:right-2 z-10 w-12 h-12 md:w-20 md:h-20 flex items-center justify-center  rounded-lg bg-transparent "
          onClick={handleEditMapToggle}
        >
          <Image width={40} height={40} src="/icons/summary/edit_map.png" alt="Edit" />
        </button>
      )}
      <CoinAnimation
        key={JSON.stringify(coinAnimationTarget ?? {})}
        targetPosition={coinAnimationTarget}
        onComplete={handleCoinAnimationComplete}
        coinCount={1}
      />
      {/* create a component that shows total days  */}
      {lockPeriod !== null && lockPeriod !== undefined && (
        <div className="relative flex-1 flex items-center">
          <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={token?.symbol}
                className="h-full w-full flex flex-row"
                initial={{ opacity: 0, y: '100%', x: 0 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  x: 0,
                  // x: `${-lockPeriods?.findIndex((lp) => lp.lockPeriod === lockPeriod) * 100}%`,
                }}
                exit={{ opacity: 0, y: '-100%', x: 0 }}
                transition={{
                  opacity: { duration: 0.4 },
                  y: {
                    type: 'spring',
                    stiffness: 250,
                    damping: 25,
                    duration: 0.5,
                  },
                  x: {
                    type: 'spring',
                    stiffness: 300,
                    damping: 30,
                    delay: 0.3,
                  },
                }}
              >
                <div className="h-full w-full shrink-0">
                  <WorldMap walletAddress={walletAddress} worldType={WorldType.FOREST} isAvailable={true} />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Modal de Edición */}
          <EditPanels open={isEditingMap} onOpenChange={handleEditPanelsClose} />
          {/* Botón de Onboarding/Ayuda */}
          {/* <motion.div
            animate={{
              y: [0, -8, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute max-w-xl flex rounded-md top-4 left-4 z-10 bg-transparent hover:bg-primary disabled:opacity-30 py-2 md:px-4 px-0"
          >
            <Button
              id="onboarding-button"
              isIconOnly
              variant="solid"
              className="bg-transparent flex flex-col py-8"
              onPress={() => {
                trackUserAction('onboarding_clicked');
                setIsTutorialModalOpen(true);
              }}
              size="lg"
              title="Tutorial"
            >
              <Image src="/vaquita/tutorial.png" alt="Tutorial" width={38} height={38} />
              <span className="text-black text-xs">Tutorial</span>
            </Button>
          </motion.div> */}
        </div>
      )}

      <div className="relative">
        <DepositPanel />
      </div>

      {isTutorialModalOpen && (
        <TutorialModal isOpen={isTutorialModalOpen} onClose={() => setIsTutorialModalOpen(false)} />
      )}

      {showBankAPYModal && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}

      {/* {showStreakModal && <StreakModal open={showStreakModal} onOpenChange={() => setShowStreakModal(false)} />} */}

      {/* {showSilverModal && <ItemsModal open={showSilverModal} onOpenChange={() => setShowSilverModal(false)} />} */}
    </div>
  );
}
