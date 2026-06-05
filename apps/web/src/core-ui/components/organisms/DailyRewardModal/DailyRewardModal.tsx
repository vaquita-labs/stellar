'use client';

import { Button, Spinner } from '@heroui/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { AppModal } from '../../molecules/AppModal';
import { DailyRewardModalProps } from './types';

type Step = 'confirm' | 'success';

export function DailyRewardModal({
  open,
  onOpenChange,
  coinsToCollect,
  experienceToCollect,
  streakDays,
  onCollect,
}: DailyRewardModalProps) {
  const [step, setStep] = useState<Step>('confirm');
  const [isCollecting, setIsCollecting] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('confirm');
      setIsCollecting(false);
    }
  }, [open]);

  const handleCollect = async () => {
    setIsCollecting(true);
    try {
      await onCollect();
      setStep('success');
    } catch (err) {
      console.error('DailyRewardModal collect', err);
    } finally {
      setIsCollecting(false);
    }
  };

  const coinLabel = coinsToCollect === 1 ? 'moneda' : 'monedas';
  const hasExperience = experienceToCollect > 0;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Daily Reward"
      titleIcon="/icons/global/coin.png"
      titleIconAlt="reward"
      size="sm"
      isDismissable={!isCollecting}
    >
      <div className="flex flex-col items-center text-center gap-5 py-2">
        <div className="flex items-center justify-center gap-3">
          <Image src="/icons/global/coin.png" alt="coins" width={56} height={56} priority />
          <span className="text-4xl font-bold text-black">+{coinsToCollect}</span>
        </div>

        {hasExperience && (
          <div className="flex items-center justify-center gap-2 rounded-full bg-white border border-black border-b-2 px-3 py-1">
            <span className="text-base font-bold text-black">+{experienceToCollect} XP</span>
          </div>
        )}

        {step === 'confirm' ? (
          <>
            <p className="text-lg font-semibold text-black">
              ¡Tu vaquita tiene una recompensa para ti!
            </p>
            <p className="text-sm text-gray-600">
              Recoge tu {coinLabel} diaria y mantén tu racha viva.
            </p>

            <Button
              onPress={handleCollect}
              isDisabled={isCollecting}
              className="w-full bg-primary text-black border border-black border-b-2 font-semibold rounded-md"
              size="lg"
            >
              {isCollecting ? <Spinner size="sm" color="current" /> : `Recoger +${coinsToCollect}`}
            </Button>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-black">
              ¡Ganaste {coinsToCollect} {coinLabel}
              {hasExperience ? ` y ${experienceToCollect} XP` : ''}!
            </p>

            <div className="flex items-center justify-center gap-2 bg-white border border-black border-b-2 rounded-md px-4 py-3 w-full">
              <Image src="/icons/global/streak.png" alt="streak" width={28} height={28} />
              <span className="text-base font-bold text-black">Racha activa: {streakDays} días</span>
            </div>

            <p className="text-sm text-gray-600">Sigue ahorrando para mantener tu racha y subir de nivel.</p>

            <Button
              onPress={onOpenChange}
              className="w-full bg-primary text-black border border-black border-b-2 font-semibold rounded-md"
              size="lg"
            >
              ¡Genial!
            </Button>
          </>
        )}
      </div>
    </AppModal>
  );
}
