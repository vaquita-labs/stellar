'use client';

import { Button, Spinner } from '@heroui/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppModal } from '../../molecules/AppModal';
import { DailyRewardModalProps } from './types';

type Step = 'confirm' | 'success';

export function DailyRewardModal({
  open,
  onOpenChange,
  coinsToCollect,
  streakDays,
  onCollect,
}: DailyRewardModalProps) {
  const { t } = useTranslation();
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

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('rewards.daily.title', 'Daily Reward')}
      size="sm"
      isDismissable={!isCollecting}
    >
      <div className="flex flex-col items-center text-center gap-5 py-2">
        <div className="flex items-center justify-center gap-3">
          <span className="text-4xl font-bold text-black">+{coinsToCollect}</span>
          <Image src="/icons/global/coin.png" alt={t('rewards.daily.coinsAlt', 'coins')} width={56} height={56} priority />
        </div>

        {step === 'confirm' ? (
          <>
            <p className="text-base font-normal text-gray-600">
              {t('rewards.daily.confirmTitle', 'Your vaquita saved this for you today.')}
            </p>

            <Button
              onPress={handleCollect}
              isDisabled={isCollecting}
              className="w-full bg-primary text-black border border-black border-b-2 font-semibold rounded-md"
              size="lg"
            >
              {isCollecting ? <Spinner size="sm" color="current" /> : t('rewards.daily.collectButton', 'Claim')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-black">
              {t('rewards.daily.success', 'You earned {{count}} coin!', { count: coinsToCollect })}
            </p>

            <div className="flex items-center justify-center gap-2 bg-white border border-black border-b-2 rounded-md px-4 py-3 w-full">
              <Image src="/icons/global/streak_face.png" alt={t('rewards.daily.streakAlt', 'streak')} width={28} height={28} />
              <span className="text-base font-bold text-black">
                {t('rewards.daily.activeStreak', 'Active streak: {{count}} day', { count: streakDays })}
              </span>
            </div>

            <Button
              onPress={onOpenChange}
              className="w-full bg-primary text-black border border-black border-b-2 font-semibold rounded-md"
              size="lg"
            >
              {t('rewards.daily.greatButton', 'Awesome!')}
            </Button>
          </>
        )}
      </div>
    </AppModal>
  );
}
