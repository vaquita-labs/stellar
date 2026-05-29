'use client';

import { Button } from '@heroui/react';
import { VaquitaMood } from '@/core-ui/types';
import { AppModal } from '../../molecules/AppModal';
import { MoodMessageModalProps } from './types';

const MOOD_COPY: Record<VaquitaMood, { emoji: string; title: string; message: string; cta: string }> = {
  happy: {
    emoji: '✨',
    title: 'Tu vaquita está feliz',
    message: 'Tienes tu recompensa diaria lista para recoger.',
    cta: 'Recoger',
  },
  celebrating: {
    emoji: '🎉',
    title: '¡Tu vaquita está celebrando!',
    message: 'Uno de tus depósitos llegó a su objetivo. Ya puedes retirarlo con todas sus ganancias.',
    cta: 'Ver depósitos',
  },
  loved: {
    emoji: '❤',
    title: 'Tu vaquita está enamorada',
    message: 'Tienes depósitos activos generando intereses. ¡Sigue así!',
    cta: 'Entendido',
  },
  sad: {
    emoji: '😢',
    title: 'Tu vaquita está triste',
    message: 'Hiciste un retiro anticipado. ¡Vuelve a depositar para alegrarla!',
    cta: 'Entendido',
  },
  sick: {
    emoji: '🤒',
    title: 'Tu vaquita está enferma',
    message: 'Algo no anda bien. Revisa tu racha o tus depósitos.',
    cta: 'Entendido',
  },
  normal: {
    emoji: '🙂',
    title: 'Tu vaquita está tranquila',
    message: 'Todo en orden por ahora.',
    cta: 'Entendido',
  },
};

export function MoodMessageModal({ open, onOpenChange, mood }: MoodMessageModalProps) {
  const copy = MOOD_COPY[mood];

  return (
    <AppModal open={open} onOpenChange={onOpenChange} title={copy.title} size="sm">
      <div className="flex flex-col items-center text-center gap-5 py-2">
        <span className="text-6xl">{copy.emoji}</span>
        <p className="text-base text-black">{copy.message}</p>
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
