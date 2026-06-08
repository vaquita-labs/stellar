'use client';

import { Button } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { VaquitaMood } from '@/core-ui/types';
import { AppModal } from '../../molecules/AppModal';
import { DailyCheckCountdown } from './DailyCheckCountdown';
import { MoodMessageModalProps } from './types';

const MOOD_COPY: Record<VaquitaMood, { image: string; message: string; cta: string }> = {
  excited: {
    image: '/vaquita/moods/excited.png',
    message: 'One of your deposits reached its goal or your daily reward is ready! Time to celebrate!',
    cta: 'Got it',
  },
  loved: {
    image: '/vaquita/moods/loved.png',
    message: 'You have active deposits earning interest. Keep it up!',
    cta: 'Got it',
  },
  sad: {
    image: '/vaquita/moods/sad.png',
    message: 'You made an early withdrawal. Deposit again to cheer her up!',
    cta: 'Got it',
  },
  normal: {
    image: '/vaquita/moods/normal.png',
    message: 'All good for now.',
    cta: 'Got it',
  },
};

export function MoodMessageModal({ open, onOpenChange, mood }: MoodMessageModalProps) {
  const { t } = useTranslation();
  const copy = MOOD_COPY[mood];

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('rewards.mood.title', 'Your vaquita\'s status')}
      size="sm"
    >
      <div className="flex flex-col items-center text-center gap-5 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={copy.image} alt={mood} className="w-32 h-32 object-contain" draggable={false} />
        <p className="text-base text-black">{t(`rewards.mood.${mood}.message`, copy.message)}</p>
        <DailyCheckCountdown />
        <Button
          onPress={onOpenChange}
          className="w-full bg-primary text-black border border-black border-b-2 font-semibold rounded-md"
          size="lg"
        >
          {t(`rewards.mood.${mood}.cta`, copy.cta)}
        </Button>
      </div>
    </AppModal>
  );
}
