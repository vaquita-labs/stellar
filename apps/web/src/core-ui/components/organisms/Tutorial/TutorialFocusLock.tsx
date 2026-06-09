'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface TutorialFocusLockProps {
  /**
   * Selector CSS del ÚNICO elemento que queda enfocado (nítido y clicleable)
   * dentro de un modal ya abierto. Ej.: `[data-slot="modal-footer"] button`.
   */
  selector: string;
  /** Padding (px) del recorte alrededor del elemento enfocado. */
  pad?: number;
}

const REMEASURE_MS = 200;

/**
 * Enfoca un único elemento dentro de un modal ABIERTO sin tocar el modal:
 * oscurece y BLOQUEA (pointer-events) todo lo demás con cuatro paneles que
 * rodean al elemento, dejando un hueco por el que solo ese elemento queda
 * visible y clicleable, con un borde parpadeante encima.
 *
 * Se monta por encima de los modales (z muy alto, como TutorialRing) y mide el
 * rect del target en vivo, así reacciona a la animación de apertura, resize y
 * scroll. Es agnóstico del modal: sirve para depósito, retiro o cualquier otro
 * paso del tutorial que deba forzar un único click.
 */
export function TutorialFocusLock({ selector, pad = 6 }: TutorialFocusLockProps) {
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

  return (
    <div aria-hidden className="fixed inset-0 z-[9998]">
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
    </div>
  );
}
