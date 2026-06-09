'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { Button } from '../../atoms';
import { TutorialCard } from './TutorialCard';
import { formatTutorialMoney, TUTORIAL_STEPS, TutorialStep } from './tutorialConfig';

interface TutorialOverlayProps {
  step: TutorialStep;
  index: number;
  /** Monto depositado (dinámico: lo que el usuario eligió en el modal). */
  amount: number;
  /** Interés simulado para ese monto. */
  interest: number;
  primaryLabel: string;
  primaryDisabled: boolean;
  primaryLoading: boolean;
  onPrimary: () => void;
  onSkip: () => void;
}

const SPOTLIGHT_PAD = 8;

/**
 * Mide en vivo el rect del elemento real a resaltar. Re-mide en resize/scroll y
 * en un intervalo corto, porque el home (canvas 3D, datos async) puede montar
 * o reposicionar el botón tras el primer paint.
 */
function useTargetRect(selector?: string) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const id = window.setInterval(measure, 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [selector]);

  return rect;
}

export function TutorialOverlay({
  step,
  index,
  amount,
  interest,
  primaryLabel,
  primaryDisabled,
  primaryLoading,
  onPrimary,
  onSkip,
}: TutorialOverlayProps) {
  const { t } = useTranslation();
  const rect = useTargetRect(step.spotlight);
  const finalAmount = amount + interest;
  const isSpotlight = step.kind === 'deposit' || step.kind === 'spotlight';
  // Tarjeta con botón: en pasos de mensaje/aviso/éxito. En spotlight se avanza
  // tocando el botón REAL (salvo que no se pueda medir → botón de respaldo).
  // En espera no hay botón (auto-avanza).
  const showCta = step.kind !== 'waiting' && (!isSpotlight || !rect);

  // La tarjeta se ubica en el lado opuesto al spotlight para no taparlo.
  const cardAtTop = !!rect && rect.top > (typeof window !== 'undefined' ? window.innerHeight : 0) / 2;

  const spotStyle = rect
    ? {
        left: rect.left - SPOTLIGHT_PAD,
        top: rect.top - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
      }
    : undefined;

  // En la espera no bloqueamos el mapa: dejamos que el usuario lo mueva/haga
  // zoom. Solo el botón "Skip" recupera pointer-events.
  const isWaiting = step.kind === 'waiting';

  return (
    <div className={`fixed inset-0 z-50 ${isWaiting ? 'pointer-events-none' : ''}`}>
      {/* En la espera bloqueamos solo el header y el nav (para no salir del
          tutorial sin querer); el centro queda interactivo para mover el mapa. */}
      {isWaiting && (
        <>
          <div className="pointer-events-auto absolute inset-x-0 top-0 h-32" />
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 h-16" />
        </>
      )}

      {/* Scrim oscuro con recorte (spotlight) sobre el elemento real */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tutorial-spotlight">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - SPOTLIGHT_PAD}
                y={rect.top - SPOTLIGHT_PAD}
                width={rect.width + SPOTLIGHT_PAD * 2}
                height={rect.height + SPOTLIGHT_PAD * 2}
                rx={16}
                fill="black"
              />
            )}
          </mask>
        </defs>
        {/* Oscurecemos para enfocar la tarjeta. En la espera dejamos el mapa
            visible para mirar a la vaquita. Si hay spotlight, el recorte deja
            ver el botón real resaltado. */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={step.kind === 'waiting' ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.66)'}
          mask="url(#tutorial-spotlight)"
        />
      </svg>

      {/* Anillo pulsante alrededor del elemento resaltado */}
      {rect && (
        <motion.div
          className="pointer-events-none absolute rounded-2xl border-[3px] border-black shadow-[0_0_0_3px_rgba(255,255,255,0.9)]"
          style={spotStyle}
          animate={{ opacity: [0.55, 1, 0.55], scale: [1, 1.02, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Caja de click sobre el botón real: abrir el modal pulsando el botón REAL */}
      {rect && isSpotlight && (
        <button aria-label={t(step.ctaKey, step.params)} onClick={onPrimary} className="absolute cursor-pointer rounded-2xl" style={spotStyle} />
      )}

      {/* Saltar tutorial: abajo, centrado y discreto (también marca el flag). */}
      <div className="absolute inset-x-0 bottom-[24px] flex justify-center">
        <button
          onClick={onSkip}
          disabled={primaryLoading}
          className="pointer-events-auto rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm transition hover:text-white disabled:opacity-40"
        >
          {t('tutorial.skip', 'Skip tutorial')}
        </button>
      </div>

      {/* Espera: sin tarjeta grande para no tapar el mapa; solo un hint chico,
          por encima del botón Save para no taparlo. */}
      {step.kind === 'waiting' && (
        <div className="absolute inset-x-0 bottom-44 flex justify-center px-4">
          <div className="rounded-full border-2 border-black bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg">
            {t(step.bodyKey, step.params)}
          </div>
        </div>
      )}

      {/* Tarjeta de narración: centrada en pasos de mensaje; en pasos con
          spotlight se ubica arriba/abajo para no tapar el botón resaltado. */}
      {step.kind !== 'waiting' && (
      <div
        className={`absolute inset-x-0 flex justify-center px-4 ${
          !rect ? 'inset-y-0 items-center' : cardAtTop ? 'top-6 sm:top-10' : 'bottom-28'
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: cardAtTop ? -20 : 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: cardAtTop ? -16 : 16 }}
            transition={{ duration: 0.28 }}
            className="w-full max-w-md"
          >
            <TutorialCard
              dotIndex={index}
              dotCount={TUTORIAL_STEPS.length}
              title={t(step.titleKey, step.params)}
              body={t(step.bodyKey, step.params)}
              footer={
                // En pasos con spotlight no hay botón en la tarjeta: se avanza
                // tocando el botón REAL resaltado. En pasos de mensaje sí.
                showCta ? (
                  <Button type="primary" wFull onPress={onPrimary} isDisabled={primaryDisabled} isLoading={primaryLoading}>
                    {primaryLabel}
                  </Button>
                ) : undefined
              }
            >
              {step.kind === 'warn' && (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                  <FiAlertTriangle className="shrink-0" size={18} />
                  <span>
                    {t('tutorial.warn.keepLose', {
                      defaultValue: 'Keep {{amount}}, lose {{interest}} interest.',
                      amount: formatTutorialMoney(amount),
                      interest: formatTutorialMoney(interest),
                    })}
                  </span>
                </div>
              )}

              {step.kind === 'success' && (
                <div className="mt-4 rounded-lg border border-black/10 bg-emerald-50 p-3 text-sm">
                  <div className="flex justify-between py-0.5 text-black/70">
                    <span>{t('tutorial.receipt.deposit', 'Deposit')}</span>
                    <span className="tabular-nums">{formatTutorialMoney(amount)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 text-emerald-700">
                    <span>{t('tutorial.receipt.interestEarned', 'Interest earned')}</span>
                    <span className="tabular-nums">+{formatTutorialMoney(interest)}</span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-black/10 pt-2 font-bold text-black">
                    <span className="flex items-center gap-1">
                      <FiCheckCircle className="text-emerald-600" /> {t('tutorial.receipt.youReceived', 'You received')}
                    </span>
                    <span className="tabular-nums">{formatTutorialMoney(finalAmount)}</span>
                  </div>
                </div>
              )}
            </TutorialCard>
          </motion.div>
        </AnimatePresence>
      </div>
      )}
    </div>
  );
}
