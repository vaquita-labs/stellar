'use client';

import { sdk } from '@farcaster/miniapp-sdk';
import { Button } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { useDeposits } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';
import { WorldType } from '../../types';
import { T } from '../atoms';
import { LoaderScreen } from '../molecules';
import { DepositPanel, SavingsStats, TutorialModal } from '../organisms';
import { WorldMap } from '../templates';

export function HomePage() {
  const router = useRouter();
  const { walletAddress, lockPeriod, network, token, setLockPeriod } = useNetworkConfigStore();
  const { isLoading } = useDeposits(walletAddress);
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false);

  const lockPeriods = useMemo(() => {
    if (!network?.tokens || !token) return [];

    const worldTypes = [WorldType.FOREST, WorldType.DESERT, WorldType.VOLCANO];

    return network.tokens
      .filter((tk) => {
        return tk.symbol === token?.symbol;
      })
      .flatMap((tk) => tk.lockPeriod)
      .map((lp, index) => ({
        lockPeriod: lp,
        type: worldTypes[index % worldTypes.length],
        isAvailable: lp >= 0,
      }));
  }, [network?.tokens, token]);

  const currentIndex = useMemo(
    () => lockPeriods?.findIndex((lp) => lp.lockPeriod === lockPeriod) ?? -1,
    [lockPeriods, lockPeriod]
  );

  const canGoPrev = lockPeriods && lockPeriods.length > 0;
  const canGoNext = lockPeriods && lockPeriods.length > 0;

  const handlePrev = () => {
    if (lockPeriods && lockPeriods.length > 0) {
      const newIndex = currentIndex <= 0 ? lockPeriods.length - 1 : currentIndex - 1;
      const newLockPeriod = lockPeriods[newIndex].lockPeriod;
      setLockPeriod(newLockPeriod);
    }
  };

  const handleNext = () => {
    if (lockPeriods && lockPeriods.length > 0) {
      const newIndex = currentIndex >= lockPeriods.length - 1 ? 0 : currentIndex + 1;
      const newLockPeriod = lockPeriods[newIndex].lockPeriod;
      setLockPeriod(newLockPeriod);
    }
  };

  const handleShare = async () => {
    try {
      // Get the current URL and create share URL
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/share`;

      const isMiniApp = await sdk.isInMiniApp();
      if (isMiniApp) {
        try {
          const result = await sdk.actions.composeCast({
            text: 'Achieve your savings goal and earn from the reward pool while having fun', // optional
            embeds: ['https://miniapp.vaquita.fi/share'],
          });

          if (result?.cast) {
            console.log('User posted a cast:', result.cast);
          } else {
            console.log('User canceled composing the cast.');
          }
        } catch (err) {
          console.error('Failed to open cast composer:', err);
        }
      } else if (navigator.share) {
        await navigator.share({
          title: 'Vaquita - DeFi Savings Game',
          text: 'Join me in the Vaquita ecosystem and start earning rewards through DeFi savings! 🐋',
          url: shareUrl,
        });
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(shareUrl);

        // You could show a toast notification here
        alert('Share link copied to clipboard!');
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <div className="h-full w-full flex flex-col relative">
      {isLoading && (
        <LoaderScreen withImage>
          <T>Loading...</T>
        </LoaderScreen>
      )}
      <SavingsStats />

      {lockPeriod !== null && lockPeriod !== undefined && (
        <div className="relative flex-1 flex items-center">
          <Button
            id="left-button"
            isIconOnly
            variant="solid"
            className="absolute rounded-md mb-40 left-2 z-10 bg-transparent backdrop-blur-sm border-1 border-b-2 border-black hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
            onPress={handlePrev}
            isDisabled={!canGoPrev}
            size="lg"
          >
            <FiChevronLeft className="text-2xl text-black" />
          </Button>

          <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={token?.symbol}
                className="h-full w-full flex flex-row"
                initial={{ opacity: 0, y: '100%', x: 0 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  x: `${-lockPeriods?.findIndex((lp) => lp.lockPeriod === lockPeriod) * 100}%`,
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
                {lockPeriods?.map((lp, index) => (
                  <div key={index} className="h-full w-full flex-shrink-0">
                    <WorldMap
                      walletAddress={walletAddress}
                      period={lp.lockPeriod}
                      worldType={lp.type}
                      isAvailable={lp.isAvailable}
                    />
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          <Button
            id="right-button"
            isIconOnly
            variant="solid"
            className="absolute rounded-md mb-40 right-2 z-10 bg-transparent backdrop-blur-sm border-1 border-b-2 border-black hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
            onPress={handleNext}
            isDisabled={!canGoNext}
            size="lg"
          >
            <FiChevronRight className="text-2xl text-black" />
          </Button>

          {/* Botón de Share */}
          <div className="absolute rounded-md top-4 left-4 z-10 bg-transparent backdrop-blur-sm hover:bg-primary disabled:opacity-30 py-2 px-4">
            <Button
              id="share-button"
              isIconOnly
              variant="solid"
              className="bg-transparent flex flex-col py-8"
              onPress={() => {
                handleShare();
              }}
              size="lg"
              title="Share"
            >
              <Image src="/vaquita/share.png" alt="Share" width={38} height={38} />
              <span className="text-black text-xs">Share</span>
            </Button>
          </div>

          {/* Botón de Onboarding/Ayuda */}
          <motion.div
            animate={{
              y: [0, -8, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute rounded-md top-4 right-4 z-10 bg-transparent backdrop-blur-sm hover:bg-primary disabled:opacity-30 py-2 px-4"
          >
            <Button
              id="onboarding-button"
              isIconOnly
              variant="solid"
              className="bg-transparent flex flex-col py-8"
              onPress={() => {
                setIsTutorialModalOpen(true);
              }}
              size="lg"
              title="Tutorial"
            >
              <Image src="/vaquita/tutorial.png" alt="Tutorial" width={38} height={38} />
              <span className="text-black text-xs">Tutorial</span>
            </Button>
          </motion.div>
        </div>
      )}

      <div className="relative">
        <DepositPanel />
      </div>

      {/* Modal de Tutorial */}
      <TutorialModal isOpen={isTutorialModalOpen} onClose={() => setIsTutorialModalOpen(false)} />
    </div>
  );
}
