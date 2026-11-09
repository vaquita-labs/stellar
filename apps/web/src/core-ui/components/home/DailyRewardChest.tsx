'use client';

import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfileStreak, useRestProfile, useVaquitaMood } from '../../hooks';
import { useModalPresence } from '../molecules/AppModal';
import { DailyRewardModal } from '../organisms';
import { HOME_TOUR_ANCHOR_CHEST } from '../organisms/Tutorial/homeTourConfig';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Cuánto hay que mantener presionado el cofre del mapa para abrirlo (ms). Igual
// que el del modal (ver <DailyRewardModal>): deliberado, pero no lento.
const HOLD_DURATION_MS = 800;

// Anillo de progreso alrededor del cofre flotante (96 px).
const RING_PX = 124;
const RING_STROKE = 8;
const RING_R = RING_PX / 2 - RING_STROKE;
const RING_CIRC = 2 * Math.PI * RING_R;

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
 * Es el cofre grande de abajo a la derecha del mundo, suelto sobre el mapa y
 * sin texto: brillando no dice nada, y apagado solo lleva la cuenta regresiva
 * en una pastilla debajo. Se abre ahí mismo: al mantenerlo presionado se llena
 * el anillo, se reclama y recién entonces aparece la pantalla del premio. No
 * hay modal de confirmación.
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

  // Mantener presionado el cofre flotante. `opening` cubre el gesto y la espera
  // del reclamo: el anillo queda lleno y el cofre sigue agitándose hasta que el
  // backend responde.
  const [opening, setOpening] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0..100
  const rafRef = useRef<number | null>(null);
  // true desde que el anillo llega al 100%: soltar el dedo justo ahí ya no
  // cancela, y un segundo gesto no reclama dos veces.
  const collectingRef = useRef(false);

  const stopRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const collectFromChest = () => {
    if (!canCollect || collectingRef.current) return;
    collectingRef.current = true;
    stopRaf();
    setOpening(true);
    setHoldProgress(100);
    setRewardSnapshot({ coins: goldCoinsToCollect, experience: experienceToCollect });
    handleCollect()
      .then(() => setShowModal(true))
      .catch((err) => console.error('DailyRewardChest collect', err))
      .finally(() => {
        collectingRef.current = false;
        setOpening(false);
        setHoldProgress(0);
      });
  };

  const startHold = () => {
    if (!canCollect || opening || collectingRef.current) return;
    setOpening(true);
    const startedAt = performance.now();
    const tick = () => {
      const progress = Math.min(100, ((performance.now() - startedAt) / HOLD_DURATION_MS) * 100);
      setHoldProgress(progress);
      if (progress >= 100) {
        rafRef.current = null;
        collectFromChest();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // Soltar (o sacar el dedo) antes de completar: el anillo vuelve a cero.
  const cancelHold = () => {
    if (collectingRef.current || !opening) return;
    stopRaf();
    setOpening(false);
    setHoldProgress(0);
  };

  const chestSize = 96;

  // Icono del cofre con su halo y el rebote al haber recompensa.
  const chestVisual = (
    <motion.span
      className="relative inline-flex items-center justify-center"
      animate={
        opening
          ? { y: 0, rotate: [-4, 4, -4], scale: [1, 1.06, 1] }
          : canCollect
            ? { y: [0, -6, 0], rotate: 0, scale: 1 }
            : { y: 0, rotate: 0, scale: 1 }
      }
      transition={
        opening
          ? { duration: 0.16, repeat: Infinity, ease: 'easeInOut' }
          : canCollect
            ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.2 }
      }
    >
      {canCollect && (
        <motion.span
          aria-hidden
          className="absolute inset-0 m-auto h-20 w-20 rounded-full bg-amber-400 blur-md"
          animate={{ opacity: [0.35, 0.9, 0.35], scale: [0.8, 1.3, 0.8] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <Image
        src={canCollect ? '/icons/global/shiny_chest.webp' : '/icons/global/chest.webp'}
        alt={t('home.dailyReward.chestAlt', 'Chest')}
        width={chestSize}
        height={chestSize}
        className="pointer-events-none relative object-contain"
        draggable={false}
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
      // El cofre ya se abrió (y se reclamó) sobre el mapa: el modal entra
      // directo en la pantalla del premio.
      startAt="reward"
    />
  );

  return (
    <>
      {/* El cofre suelto sobre el mapa, sin tarjeta ni texto: el brillo y el
          rebote son lo que lo vuelve un botón. Se abre manteniéndolo
          presionado, acá mismo: el anillo se llena alrededor y el cofre se
          agita hasta que el premio queda reclamado. Apagado (ya se reclamó
          hoy) queda quieto y gris, con la cuenta regresiva en una pastilla
          oscura (legible sobre el agua de día y de noche). */}
      <button
        type="button"
        data-tutorial={HOME_TOUR_ANCHOR_CHEST}
        aria-label={t('home.dailyReward.chestAria', 'Daily reward')}
        aria-busy={opening}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(event) => event.preventDefault()}
        // Teclado / lector de pantalla: no hay "mantener", Enter lo abre.
        onClick={(event) => {
          if (event.detail === 0) collectFromChest();
        }}
        disabled={!canCollect}
        style={{ WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent' }}
        className={
          'flex touch-none select-none flex-col items-center gap-1 rounded-2xl bg-transparent ' +
          'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black ' +
          (canCollect ? '' : 'cursor-default')
        }
      >
        <span className="relative inline-flex items-center justify-center">
          {/* Anillo de progreso: centrado en el cofre y fuera del flujo, para
              que aparecer no mueva nada. */}
          <svg
            aria-hidden
            width={RING_PX}
            height={RING_PX}
            viewBox={`0 0 ${RING_PX} ${RING_PX}`}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-90 transition-opacity duration-150"
            style={{ opacity: opening ? 1 : 0 }}
          >
            <circle cx={RING_PX / 2} cy={RING_PX / 2} r={RING_R} fill="none" stroke="#000" strokeWidth={RING_STROKE + 3} />
            <circle cx={RING_PX / 2} cy={RING_PX / 2} r={RING_R} fill="none" stroke="#fde8c3" strokeWidth={RING_STROKE} />
            <circle
              cx={RING_PX / 2}
              cy={RING_PX / 2}
              r={RING_R}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              strokeDashoffset={RING_CIRC * (1 - holdProgress / 100)}
            />
          </svg>
          {chestVisual}
        </span>
        {!canCollect && countdown && (
          <span className="relative whitespace-nowrap rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold leading-none text-white tabular-nums">
            {countdown}
          </span>
        )}
      </button>

      {modal}
    </>
  );
};
