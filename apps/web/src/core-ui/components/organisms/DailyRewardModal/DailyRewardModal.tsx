'use client';

import { Button } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppModal } from '../../molecules/AppModal';
import { DailyRewardModalProps } from './types';

// Pantallas del modal:
//  - confirm: cofre cerrado + "mantener presionado" (no revela el monto).
//  - reward:  cofre abierto + monedas ganadas + botón "Siguiente".
//  - streak:  fuego + racha actual + botón "Listo" (cierra).
type Step = 'confirm' | 'reward' | 'streak';

// Cuánto hay que mantener presionado el cofre para abrirlo (ms). El anillo de
// progreso se llena en este tiempo; soltar antes lo reinicia.
const HOLD_DURATION_MS = 1600;

export function DailyRewardModal({
  open,
  onOpenChange,
  coinsToCollect,
  streakDays,
  onCollect,
}: DailyRewardModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('confirm');
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0..100
  const [isCollecting, setIsCollecting] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  // Se pone en true al llegar al 100% del hold y evita que un pointerup tardío
  // (soltar justo al completar) reinicie el cofre por una race de estado.
  const completingRef = useRef(false);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Reinicia todo el estado cada vez que se abre el modal, para que la próxima
  // apertura empiece siempre con el cofre cerrado.
  useEffect(() => {
    if (open) {
      setStep('confirm');
      setIsHolding(false);
      setHoldProgress(0);
      setIsCollecting(false);
      completingRef.current = false;
    }
    return stopRaf;
  }, [open, stopRaf]);

  // Al llegar al 100% del hold: dispara el collect. Mientras la red responde el
  // cofre sigue cerrado y agitándose (no revelamos el premio hasta el éxito).
  const completeHold = useCallback(async () => {
    stopRaf();
    setIsCollecting(true);
    try {
      await onCollect();
      setStep('reward');
      setIsHolding(false);
    } catch (err) {
      console.error('DailyRewardModal collect', err);
      // Falló: volvemos al cofre cerrado para que pueda reintentar.
      setIsHolding(false);
      setHoldProgress(0);
      completingRef.current = false;
    } finally {
      setIsCollecting(false);
    }
  }, [onCollect, stopRaf]);

  const startHold = useCallback(() => {
    if (step !== 'confirm' || isCollecting || isHolding) return;
    setIsHolding(true);
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setHoldProgress(progress);
      if (progress >= 100) {
        completingRef.current = true;
        void completeHold();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [step, isCollecting, isHolding, completeHold]);

  // Soltar (o sacar el dedo/cursor) antes de completar: cancela y reinicia el
  // anillo. Si ya se disparó el collect (completingRef) no se toca nada.
  const cancelHold = useCallback(() => {
    if (completingRef.current || !isHolding || isCollecting) return;
    stopRaf();
    setIsHolding(false);
    setHoldProgress(0);
  }, [isHolding, isCollecting, stopRaf]);

  // El modal ocupa toda la pantalla desde que se empieza a abrir el cofre y en
  // todas las pantallas de premio/racha.
  const expanded = step !== 'confirm' || isHolding || isCollecting;
  const busy = isHolding || isCollecting;

  const ringDeg = holdProgress * 3.6;
  const chestPx = expanded ? 176 : 104;
  const ringPx = chestPx + 64;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('rewards.daily.title', 'Daily Reward')}
      size="sm"
      fullScreen={expanded}
      // Una vez abierto el cofre solo se avanza/cierra con los botones: nada de
      // backdrop ni X en las pantallas de premio/racha (ni mientras carga).
      isDismissable={step === 'confirm' && !busy}
      hideClose={step !== 'confirm' || busy}
    >
      <div
        className={
          'select-none ' +
          (expanded
            ? 'flex flex-col items-center justify-center text-center gap-7 min-h-[70dvh] py-8'
            : 'flex flex-col items-center text-center gap-6 py-4')
        }
      >
        {step === 'reward' ? (
          <>
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 16 }}
              className="relative flex items-center justify-center"
            >
              <span
                aria-hidden
                className="absolute inset-0 m-auto rounded-full bg-amber-400 blur-2xl opacity-70"
                style={{ width: chestPx, height: chestPx }}
              />
              <Image
                src="/icons/global/shiny_chest_open.png"
                alt={t('rewards.daily.chestOpenAlt', 'Open chest')}
                width={chestPx}
                height={chestPx}
                priority
                draggable={false}
                className="relative pointer-events-none"
                style={{ filter: 'drop-shadow(0 0 14px rgba(251, 191, 36, 0.9))' }}
              />
            </motion.div>

            <p className="text-xl font-bold text-black">
              {t('rewards.daily.success', 'You earned {{count}} coin!', { count: coinsToCollect })}
            </p>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 18 }}
              className="flex items-center justify-center gap-3"
            >
              <span className="text-4xl font-bold text-black">+{coinsToCollect}</span>
              <Image src="/icons/global/coin.png" alt={t('rewards.daily.coinsAlt', 'coins')} width={56} height={56} priority draggable={false} className="pointer-events-none" />
            </motion.div>

            <Button
              onPress={() => setStep('streak')}
              className="w-full max-w-xs bg-primary text-black border border-black border-b-2 font-semibold rounded-md"
              size="lg"
            >
              {t('rewards.daily.nextButton', 'Next')}
            </Button>
          </>
        ) : step === 'streak' ? (
          <>
            <motion.span
              initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              className="text-8xl leading-none"
              style={{ filter: 'drop-shadow(0 0 18px rgba(251, 146, 60, 0.8))' }}
              role="img"
              aria-label={t('rewards.daily.streakAlt', 'streak')}
            >
              🔥
            </motion.span>

            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="text-2xl font-bold text-black"
            >
              {t('rewards.daily.streakTitle', 'You now have a {{count}}-day streak!', { count: streakDays })}
            </motion.p>

            <p className="text-sm font-normal text-gray-600">
              {t('rewards.daily.streakSubtitle', 'Come back tomorrow to keep it going.')}
            </p>

            <Button
              onPress={onOpenChange}
              className="w-full max-w-xs bg-primary text-black border border-black border-b-2 font-semibold rounded-md"
              size="lg"
            >
              {t('rewards.daily.doneButton', 'Done')}
            </Button>
          </>
        ) : (
          <>
            {/* Cofre cerrado + botón "mantener presionado". No revelamos cuánto
                se gana hasta abrirlo. */}
            <motion.button
              type="button"
              aria-label={t('rewards.daily.holdToOpen', 'Hold to open')}
              onPointerDown={startHold}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
              onContextMenu={(e) => e.preventDefault()}
              disabled={isCollecting}
              className="relative flex items-center justify-center rounded-full bg-transparent touch-none select-none"
              style={{
                width: ringPx,
                height: ringPx,
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
              whileTap={{ scale: 0.97 }}
            >
              {/* Anillo de progreso del hold (donut con conic-gradient). */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-full transition-opacity"
                style={{
                  opacity: busy ? 1 : 0,
                  background: `conic-gradient(#f59e0b ${ringDeg}deg, rgba(0,0,0,0.08) ${ringDeg}deg)`,
                  WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 9px), #000 calc(100% - 8px))',
                  mask: 'radial-gradient(farthest-side, transparent calc(100% - 9px), #000 calc(100% - 8px))',
                }}
              />

              {/* Halo que se intensifica al presionar. */}
              <span
                aria-hidden
                className="absolute inset-0 m-auto rounded-full bg-amber-400 blur-2xl transition-opacity"
                style={{ width: chestPx, height: chestPx, opacity: busy ? 0.7 : 0.35 }}
              />

              {/* El cofre cerrado se agita mientras se mantiene presionado. */}
              <motion.span
                className="relative inline-flex"
                animate={busy ? { rotate: [-3, 3, -3], scale: [1, 1.05, 1] } : { rotate: 0, scale: 1 }}
                transition={
                  busy
                    ? { duration: 0.16, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.2 }
                }
              >
                <Image
                  src="/icons/global/shiny_chest.png"
                  alt={t('rewards.daily.chestClosedAlt', 'Closed chest')}
                  width={chestPx}
                  height={chestPx}
                  priority
                  draggable={false}
                  className="relative pointer-events-none"
                  style={{ filter: 'drop-shadow(0 0 10px rgba(251, 191, 36, 0.85))' }}
                />
              </motion.span>
            </motion.button>

            <AnimatePresence mode="wait">
              <motion.p
                key={busy ? 'opening' : 'idle'}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="text-base font-semibold text-black"
              >
                {busy
                  ? t('rewards.daily.opening', 'Opening…')
                  : t('rewards.daily.holdToOpen', 'Hold to open')}
              </motion.p>
            </AnimatePresence>

            {!busy && (
              <p className="text-sm font-normal text-gray-600">
                {t('rewards.daily.confirmTitle', 'Your vaquita saved this for you today.')}
              </p>
            )}
          </>
        )}
      </div>
    </AppModal>
  );
}
