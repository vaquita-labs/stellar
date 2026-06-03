'use client';

import { Button } from '@heroui/react';
import Image from 'next/image';
import { AppModal } from '../../molecules/AppModal';
import { DailyRewardModalProps } from './types';

export function DailyRewardModal({ open, onOpenChange, coinsCollected, streakDays }: DailyRewardModalProps) {
  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Daily Reward"
      titleIcon="/icons/global/gold-coin.png"
      titleIconAlt="reward"
      size="sm"
    >
      <div className="flex flex-col items-center text-center gap-5 py-2">
        <div className="flex items-center justify-center gap-3">
          <Image src="/icons/global/gold-coin.png" alt="coins" width={56} height={56} priority />
          <span className="text-4xl font-bold text-black">+{coinsCollected}</span>
        </div>

        <p className="text-lg font-semibold text-black">¡Ganaste {coinsCollected} monedas!</p>

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
      </div>
    </AppModal>
  );
}
