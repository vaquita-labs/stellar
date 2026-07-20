'use client';

import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfileStreak, useRestProfile, useVaquitaMood } from '../../hooks';
import { useModalPresence } from '../molecules/AppModal';
import { DailyRewardModal } from '../organisms';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Cuenta regresiva hasta el próximo reset de la recompensa diaria. El backend
 * define el "día" como `ceil(epoch / ONE_DAY)` (medianoche UTC), así que el
 * siguiente reset es la próxima medianoche UTC y el cliente la calcula igual
 * desde `Date.now()`. Devuelve `HH:MM:SS` y avisa (`justReset`) cuando cruza el
 * borde para que quien lo use pueda refrescar el estado del cofre.
 */
const useNextDailyResetCountdown = (active: boolean, onReset: () => void) => {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!active) return;

    const tick = () => {
      const now = Date.now();
      const nextReset = (Math.floor(now / ONE_DAY_MS) + 1) * ONE_DAY_MS;
      const remaining = nextReset - now;
      if (remaining <= 0) {
        onReset();
        return;
      }
      const totalSeconds = Math.floor(remaining / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      setLabel(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, onReset]);

  return label;
};

/**
 * Cofre de recompensa diaria que flota sobre el cielo, debajo de la barra de
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
  const modalMounted = useModalPresence(showModal);
  // Snapshot al abrir el modal: al reclamar se invalida ['profile'] y el
  // daily-check refetchea con amountToCollect=0, así que si el modal leyera el
  // valor vivo la pantalla de éxito diría "+0 coins".
  const [rewardSnapshot, setRewardSnapshot] = useState({ coins: 0, experience: 0 });

  const streakDays = (streak?.yesterdayStreak ?? 0) + (streak?.todayStreak ? 1 : 0);

  const handleOpen = () => {
    if (!canCollect) return;
    setRewardSnapshot({ coins: goldCoinsToCollect, experience: experienceToCollect });
    setShowModal(true);
  };

  const handleCollect = async () => {
    await goldDailyCollect();
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  // Al cruzar la medianoche UTC con la app abierta, refresca el daily-check para
  // que el cofre se ilumine solo sin recargar.
  const handleReset = () => {
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };
  const countdown = useNextDailyResetCountdown(!canCollect, handleReset);

  return (
    <>
      <div className="flex flex-col items-center gap-0.5">
        <motion.button
          type="button"
          aria-label={t('home.dailyReward.chestAria', 'Daily reward')}
          onClick={handleOpen}
          disabled={!canCollect}
          className="flex items-center justify-center bg-transparent disabled:cursor-default"
          animate={canCollect ? { y: [0, -6, 0] } : { y: 0 }}
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
                className="absolute inset-0 m-auto h-10 w-10 rounded-full bg-amber-400 blur-md"
                animate={{ opacity: [0.35, 0.9, 0.35], scale: [0.8, 1.3, 0.8] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <Image
              src={canCollect ? '/icons/global/shiny_chest.png' : '/icons/global/chest.png'}
              alt={t('home.dailyReward.chestAlt', 'Chest')}
              width={40}
              height={40}
              className="relative object-contain"
              priority
              style={
                canCollect
                  ? { filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.95))' }
                  : { filter: 'grayscale(70%)', opacity: 0.6 }
              }
            />
          </span>
        </motion.button>

        {!canCollect && countdown && (
          <span className="rounded-full bg-black/45 px-1.5 py-0.5 text-[8px] font-bold leading-none text-white tabular-nums opacity-60">
            {countdown}
          </span>
        )}
      </div>

      {modalMounted && (
        <DailyRewardModal
          open={showModal}
          onOpenChange={() => setShowModal(false)}
          coinsToCollect={rewardSnapshot.coins}
          experienceToCollect={rewardSnapshot.experience}
          streakDays={streakDays}
          onCollect={handleCollect}
        />
      )}
    </>
  );
};
