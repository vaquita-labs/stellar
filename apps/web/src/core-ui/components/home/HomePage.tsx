'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useAnalytics, useDeposits } from '../../hooks';
import { EditionMode, useLoading, useMapStore, useConfigStore } from '../../stores';
import { WorldType } from '../../types';
import { BankAPYModal, CoinAnimation, DepositPanel, TutorialModal } from '../organisms';
import { WorldMap } from '../templates';
import { BackgroundMusic } from './BackgroundMusic';
import { EditPanels } from './edit';
import { HeaderStats } from './HeaderStats';
import { PlaceModeHint } from './PlaceModeHint';

export function HomePage() {
  const { walletAddress, lockPeriod, network, token } = useConfigStore();
  const { isLoading } = useDeposits(walletAddress);
  const { trackPageView, trackUserAction } = useAnalytics();
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false);
  const isEditingMap = useMapStore((store) => store.isEditingMap);
  const setIsEditingMap = useMapStore((store) => store.setIsEditingMap);
  const setEditMode = useMapStore((store) => store.setEditMode);
  const setEditingObjectPosition = useMapStore((store) => store.setEditingObjectPosition);

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
        network: network?.networkName || null,
      });
    }
  }, [walletAddress, network?.networkName, trackUserAction]);

  useLoading('deposits', isLoading);

  const handleCoinAnimationComplete = () => {
    setCoinAnimationTarget(null);
  };


  const handleEditPanelsClose = () => {
    setIsEditingMap(false);
    setEditMode(null);
    setEditingObjectPosition(null);
  };

  return (
    <div className="h-full w-full flex flex-col relative">
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
        <div className="relative flex-1 flex items-stretch">
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

          <DepositPanel />

          <EditPanels open={isEditingMap} onOpenChange={handleEditPanelsClose} />
        </div>
      )}

      {isTutorialModalOpen && (
        <TutorialModal isOpen={isTutorialModalOpen} onClose={() => setIsTutorialModalOpen(false)} />
      )}

      {showBankAPYModal && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}

      {/* {showStreakModal && <StreakModal open={showStreakModal} onOpenChange={() => setShowStreakModal(false)} />} */}

      {/* {showSilverModal && <ItemsModal open={showSilverModal} onOpenChange={() => setShowSilverModal(false)} />} */}
    </div>
  );
}
