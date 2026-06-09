'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { TutorialCard } from './TutorialCard';

interface TutorialFocusLockProps {
  /**
   * Selector CSS del ÚNICO elemento que queda enfocado (nítido y clicleable)
   * dentro de un modal ya abierto. Ej.: `[data-slot="modal-footer"] button`.
   */
  selector: string;
  /** Padding (px) del recorte alrededor del elemento enfocado. */
  pad?: number;
  /** Título corto del mensaje guía (opcional). */
  title?: string;
  /** Mensaje guía que aparece pegado al elemento (arriba o abajo según el espacio). */
  message?: string;
  /** Índice del paso actual (para los dots de progreso de la tarjeta guía). */
  dotIndex?: number;
  /** Total de pasos (para los dots de progreso de la tarjeta guía). */
  dotCount?: number;
  /**
   * Ancla la tarjeta guía cerca del borde SUPERIOR del viewport en vez de
   * pegarla al elemento. Útil cuando el elemento resaltado está abajo (ej. el
   * botón Deposit) y la tarjeta taparía el contenido que se debe poder ver.
   */
  pinTop?: boolean;
}

const REMEASURE_MS = 200;
const CARD_GAP = 12;
const CARD_MAX_PX = 360;
// Offset desde el borde superior cuando la tarjeta se ancla arriba (pinTop).
const CARD_TOP_OFFSET = 16;

/**
 * Enfoca un único elemento dentro de un modal ABIERTO sin tocar el modal:
 * oscurece y BLOQUEA (pointer-events) todo lo demás con cuatro paneles que
 * rodean al elemento, dejando un hueco por el que solo ese elemento queda
 * visible y clicleable, con un borde parpadeante encima. Si se pasa `message`,
 * muestra además una tarjetita guía pegada al elemento (arriba o abajo).
 *
 * Se monta por encima de los modales (z muy alto) y mide el rect del target en
 * vivo, así reacciona a la animación de apertura, resize y scroll. Es agnóstico
 * del modal: sirve para depósito, retiro o cualquier otro paso del tutorial.
 */
export function TutorialFocusLock({ selector, pad = 6, title, message, dotIndex, dotCount, pinTop }: TutorialFocusLockProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const id = window.setInterval(measure, REMEASURE_MS);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [selector]);

  if (!rect) return null;

  const top = Math.max(0, rect.top - pad);
  const left = Math.max(0, rect.left - pad);
  const right = rect.right + pad;
  const bottom = rect.bottom + pad;
  // Paneles que oscurecen + capturan el click (pointer-events-auto) en todo
  // menos el hueco del elemento enfocado. Sin blur: solo un scrim oscuro.
  const panel = 'fixed bg-black/60 pointer-events-auto';

  // Posición de la tarjeta guía: centrada sobre el elemento, arriba si hay
  // espacio (si no, abajo), y clampeada a los bordes del viewport.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const cardW = Math.min(CARD_MAX_PX, vw - 24);
  const centerX = (rect.left + rect.right) / 2;
  const cardLeft = Math.min(Math.max(centerX, 12 + cardW / 2), vw - 12 - cardW / 2);
  // pinTop: la tarjeta va arriba del todo (no tapa el contenido sobre el botón).
  const placeAbove = !pinTop && rect.top > 150;
  const cardStyle = pinTop
    ? { left: cardLeft, top: CARD_TOP_OFFSET, width: cardW }
    : placeAbove
      ? { left: cardLeft, bottom: vh - top + CARD_GAP, width: cardW }
      : { left: cardLeft, top: bottom + CARD_GAP, width: cardW };

  return (
    // El wrapper NO captura clicks (pointer-events-none): así el hueco del
    // elemento enfocado deja pasar el click al elemento real. Solo los cuatro
    // paneles (pointer-events-auto) bloquean todo lo demás.
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9998]">
      {/* Arriba */}
      <div className={panel} style={{ left: 0, right: 0, top: 0, height: top }} />
      {/* Abajo */}
      <div className={panel} style={{ left: 0, right: 0, top: bottom, bottom: 0 }} />
      {/* Izquierda (a la altura del hueco) */}
      <div className={panel} style={{ left: 0, top, width: left, height: bottom - top }} />
      {/* Derecha (a la altura del hueco) */}
      <div className={panel} style={{ left: right, right: 0, top, height: bottom - top }} />

      {/* Borde parpadeante sobre el elemento enfocado (no bloquea el click) */}
      <motion.div
        className="pointer-events-none fixed rounded-md border-[3px] border-black shadow-[0_0_0_3px_rgba(255,255,255,0.9)]"
        style={{ left, top, width: right - left, height: bottom - top, zIndex: 9999 }}
        animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.015, 1] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Tarjeta guía pegada al elemento: misma pieza (TutorialCard) que la
          narración centrada, para que todo el tutorial se vea como un solo
          componente. Esta variante flota y no captura el click. */}
      {message && (
        <motion.div
          className="pointer-events-none fixed z-[10000] -translate-x-1/2"
          style={cardStyle}
          initial={{ opacity: 0, y: placeAbove ? 6 : -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <TutorialCard dotIndex={dotIndex} dotCount={dotCount} title={title} body={message} />
        </motion.div>
      )}
    </div>
  );
}
