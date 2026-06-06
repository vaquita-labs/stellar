'use client';

import { Button } from '@heroui/react';
import { VaquitaMood } from '@/core-ui/types';
import { AppModal } from '../../molecules/AppModal';
import { DailyCheckCountdown } from './DailyCheckCountdown';
import { MoodMessageModalProps } from './types';

const MODAL_TITLE = 'Estado de tu vaquita';

const MOOD_COPY: Record<VaquitaMood, { image: string; message: string; cta: string }> = {
  excited: {
    image: '/vaquita/moods/excited.png',
    message: '¡Uno de tus depósitos llegó a su objetivo o tienes tu recompensa diaria lista! ¡A celebrar!',
    cta: 'Entendido',
  },
  loved: {
    image: '/vaquita/moods/loved.png',
    message: 'Tienes depósitos activos generando intereses. ¡Sigue así!',
    cta: 'Entendido',
  },
  sad: {
    image: '/vaquita/moods/sad.png',
    message: 'Hiciste un retiro anticipado. ¡Vuelve a depositar para alegrarla!',
    cta: 'Entendido',
  },
  normal: {
    image: '/vaquita/moods/normal.png',
    message: 'Todo en orden por ahora.',
    cta: 'Entendido',
  },
};

export function MoodMessageModal({ open, onOpenChange, mood }: MoodMessageModalProps) {
  const copy = MOOD_COPY[mood];

  return (
    <AppModal open={open} onOpenChange={onOpenChange} title={MODAL_TITLE} size="sm">
      <div className="flex flex-col items-center text-center gap-5 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={copy.image} alt={mood} className="w-32 h-32 object-contain" draggable={false} />
        <p className="text-base text-black">{copy.message}</p>
        <DailyCheckCountdown />
        <Button
          onPress={onOpenChange}
          className="w-full bg-primary text-black border border-black border-b-2 font-semibold rounded-md"
          size="lg"
        >
          {copy.cta}
        </Button>
      </div>
    </AppModal>
  );
}
