'use client';

import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfileStreak, useRestProfile, useVaquitaMood } from '../../hooks';
import { DailyRewardModal } from '../organisms';

/**
 * Cofre de recompensa diaria que vive sobre el mapa, al lado de la barra de
 * stats. Cuando hay algo para reclamar (`canCollect`) muestra el cofre brillante
 * con un leve movimiento arriba/abajo e invita a tocarlo; si no, queda apagado y
 * quieto. Comparte el mismo flujo de reclamo que el click en la vaquita.
 */
export const DailyRewardChest = () => {
  const { t } = useTranslation();
  const { canCollect, goldCoinsToCollect, experienceToCollect } = useVaquitaMood();
  const { data: streak } = useProfileStreak();
  const { goldDailyCollect } = useRestProfile();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const streakDays = (streak?.yesterdayStreak ?? 0) + (streak?.todayStreak ? 1 : 0);

  const handleCollect = async () => {
    await goldDailyCollect();
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  return (
    <>
      <motion.button
        type="button"
        aria-label={t('home.dailyReward.chestAria', 'Daily reward')}
        onClick={() => canCollect && setShowModal(true)}
        disabled={!canCollect}
        className="flex items-center justify-center flex-1 bg-transparent disabled:cursor-default"
        animate={canCollect ? { y: [0, -3, 0] } : { y: 0 }}
        transition={
          canCollect
            ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.2 }
        }
      >
        <span className="relative inline-flex items-center justify-center">
          {canCollect && (
            <motion.span
              aria-hidden
              className="absolute inset-0 m-auto h-7 w-7 rounded-full bg-amber-400 blur-md"
              animate={{ opacity: [0.35, 0.9, 0.35], scale: [0.8, 1.3, 0.8] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <Image
            src={canCollect ? '/icons/global/shiny_chest.png' : '/icons/global/chest.png'}
            alt={t('home.dailyReward.chestAlt', 'Chest')}
            width={26}
            height={26}
            className="relative object-contain"
            priority
            style={
              canCollect
                ? { filter: 'drop-shadow(0 0 5px rgba(251, 191, 36, 0.95))' }
                : { filter: 'grayscale(70%)', opacity: 0.6 }
            }
          />
        </span>
      </motion.button>

      {showModal && (
        <DailyRewardModal
          open={showModal}
          onOpenChange={() => setShowModal(false)}
          coinsToCollect={goldCoinsToCollect}
          experienceToCollect={experienceToCollect}
          streakDays={streakDays}
          onCollect={handleCollect}
        />
      )}
    </>
  );
};
