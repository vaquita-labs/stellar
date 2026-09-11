'use client';

import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfileStreak, useRestProfile, useVaquitaMood } from '../../hooks';
import { useModalPresence } from '../molecules/AppModal';
import { DailyRewardModal } from '../organisms';
import { HOME_TOUR_ANCHOR_CHEST } from '../organisms/Tutorial/homeTourConfig';

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
 * Cofre de recompensa diaria. Cuando hay algo para reclamar (`canCollect`) muestra
 * el cofre brillante con un leve movimiento arriba/abajo e invita a tocarlo; si no,
 * queda apagado y quieto con la cuenta regresiva al próximo reset. Comparte el
 * mismo flujo de reclamo que el click en la vaquita.
 *
 * - `variant="floating"` (default): flota suelto sobre el mapa en móvil, timer
 *   debajo en una píldora.
 * - `variant="sidebar"`: fila horizontal (icono + label + timer) para encajar con
 *   los ítems del sidebar de escritorio.
 */
export const DailyRewardChest = ({ variant = 'floating' }: { variant?: 'floating' | 'sidebar' }) => {
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
    // Solo esperamos a que la recompensa se otorgue: en cuanto resuelve, el
    // modal pasa a la pantalla de premio. La invalidación corre en segundo plano
    // (fire-and-forget) para no colgar el modal si un refetch de ['profile'] se
    // demora (staleTime: Infinity refetchea todas las queries activas).
    await goldDailyCollect();
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  // Al cruzar la medianoche UTC con la app abierta, refresca el daily-check para
  // que el cofre se ilumine solo sin recargar.
  const handleReset = () => {
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };
  const countdown = useNextDailyResetCountdown(!canCollect, handleReset);

  const isSidebar = variant === 'sidebar';
  const chestSize = isSidebar ? 40 : 34;

  // Icono del cofre con su halo y el rebote al haber recompensa (se mueve solo el
  // icono, no la fila del sidebar).
  const chestVisual = (
    <motion.span
      className="relative inline-flex items-center justify-center"
      animate={canCollect ? { y: [0, -6, 0] } : { y: 0 }}
      transition={
        canCollect ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }
      }
    >
      {canCollect && (
        <motion.span
          aria-hidden
          className="absolute inset-0 m-auto h-10 w-10 rounded-full bg-amber-400 blur-md"
          animate={{ opacity: [0.35, 0.9, 0.35], scale: [0.8, 1.3, 0.8] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <Image
        src={canCollect ? '/icons/global/shiny_chest.webp' : '/icons/global/chest.webp'}
        alt={t('home.dailyReward.chestAlt', 'Chest')}
        width={chestSize}
        height={chestSize}
        className="relative object-contain"
        priority
        style={
          canCollect
            ? { filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.95))' }
            : { filter: 'grayscale(70%)', opacity: 0.6 }
        }
      />
    </motion.span>
  );

  const modal = modalMounted && (
    <DailyRewardModal
      open={showModal}
      onOpenChange={() => setShowModal(false)}
      coinsToCollect={rewardSnapshot.coins}
      experienceToCollect={rewardSnapshot.experience}
      streakDays={streakDays}
      onCollect={handleCollect}
    />
  );

  if (isSidebar) {
    return (
      <>
        <button
          type="button"
          data-tutorial={HOME_TOUR_ANCHOR_CHEST}
          aria-label={t('home.dailyReward.chestAria', 'Daily reward')}
          onClick={handleOpen}
          disabled={!canCollect}
          className="flex items-center gap-2 rounded-lg px-3 py-2 w-full font-medium text-black hover:text-primary bg-transparent disabled:cursor-default"
        >
          {chestVisual}
          <div className="flex flex-col items-start leading-tight">
            <span>{t('shell.nav.dailyReward', 'Daily reward')}</span>
            {!canCollect && countdown && (
              <span className="text-xs font-bold text-black tabular-nums opacity-60">{countdown}</span>
            )}
          </div>
        </button>
        {modal}
      </>
    );
  }

  return (
    <>
      <div data-tutorial={HOME_TOUR_ANCHOR_CHEST} className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          aria-label={t('home.dailyReward.chestAria', 'Daily reward')}
          onClick={handleOpen}
          disabled={!canCollect}
          className="flex items-center justify-center bg-transparent disabled:cursor-default"
        >
          {chestVisual}
        </button>

        {!canCollect && countdown && (
          <span className="rounded-full bg-black/45 px-1.5 py-0.5 text-[8px] font-bold leading-none text-white tabular-nums opacity-60">
            {countdown}
          </span>
        )}
      </div>

      {modal}
    </>
  );
};
