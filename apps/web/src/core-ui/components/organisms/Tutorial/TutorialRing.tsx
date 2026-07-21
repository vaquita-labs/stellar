'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface TutorialRingProps {
  /** Selector CSS del elemento a resaltar (puede estar dentro de un modal). */
  selector: string;
}

const PAD = 6;

/**
 * Anillo pulsante que resalta un elemento REAL para guiar el toque, sin texto ni
 * scrim. Se renderiza por encima de los modales (z muy alto) y con
 * pointer-events: none, así el click pasa al elemento de abajo.
 */
export function TutorialRing({ selector }: TutorialRingProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const id = window.setInterval(measure, 300);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [selector]);

  if (!rect) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed rounded-2xl border-[3px] border-black shadow-[0_0_0_3px_rgba(255,255,255,0.9)]"
      style={{
        left: rect.left - PAD,
        top: rect.top - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
        zIndex: 9999,
      }}
      animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.02, 1] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
