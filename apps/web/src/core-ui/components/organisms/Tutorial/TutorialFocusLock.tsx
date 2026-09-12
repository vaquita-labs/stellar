'use client';

import { motion } from 'framer-motion';
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { findSpotlightTarget } from './spotlightTarget';
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
  /**
   * Covers the cutout too, so the highlighted element is shown but NOT
   * clickable. For explanatory steps ("this is what this button does"), where a
   * tap would navigate away and abandon the tour. Off by default: the steps
   * that ask the user to tap the real element need the hole to stay open.
   */
  blockTarget?: boolean;
  /** Actions rendered inside the guide card (e.g. next / skip). */
  footer?: ReactNode;
}

const REMEASURE_MS = 200;
const CARD_GAP = 12;
const CARD_MAX_PX = 360;
// Offset from the top edge when the card is pinned there (pinTop), and the
// margin the card keeps from the top and bottom edges wherever else it goes.
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
export function TutorialFocusLock({
  selector,
  pad = 6,
  title,
  message,
  dotIndex,
  dotCount,
  pinTop,
  blockTarget,
  footer,
}: TutorialFocusLockProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(0);

  useEffect(() => {
    const measure = () => {
      const el = findSpotlightTarget(selector);
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

  // The card's own height decides where it goes, and it is only known once the
  // card is in the DOM. Read in a layout effect so the first paint already uses
  // it: with a guessed height the card would flash in one spot and then jump.
  const hasRect = rect !== null;
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const read = () => setCardH(el.offsetHeight);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasRect, message, footer]);

  if (!rect || typeof document === 'undefined') return null;

  const top = Math.max(0, rect.top - pad);
  const left = Math.max(0, rect.left - pad);
  const right = rect.right + pad;
  const bottom = rect.bottom + pad;
  // Paneles que oscurecen + capturan el click (pointer-events-auto) en todo
  // menos el hueco del elemento enfocado. Sin blur: solo un scrim oscuro.
  const panel = 'fixed bg-black/60 pointer-events-auto';

  // Card placement: horizontally centred on the element and clamped to the
  // viewport. Vertically it goes above the cutout when the WHOLE card fits
  // there, below when it fits there instead, and otherwise on the side with
  // more room. The final clamp keeps it on screen whatever happens: an element
  // near the top of a tall screen (the sidebar entries on a desktop) has no
  // room above, and an unclamped card there would run off the top edge.
  // pinTop: the card goes to the very top (it must not cover what sits above
  // the button).
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const cardW = Math.min(CARD_MAX_PX, vw - 24);
  const centerX = (rect.left + rect.right) / 2;
  const cardLeft = Math.min(Math.max(centerX, 12 + cardW / 2), vw - 12 - cardW / 2);
  const fitsAbove = top - CARD_GAP - cardH >= CARD_TOP_OFFSET;
  const fitsBelow = bottom + CARD_GAP + cardH <= vh - CARD_TOP_OFFSET;
  const placeAbove = !pinTop && (fitsAbove || (!fitsBelow && top > vh - bottom));
  const wantedTop = pinTop ? CARD_TOP_OFFSET : placeAbove ? top - CARD_GAP - cardH : bottom + CARD_GAP;
  const maxTop = Math.max(CARD_TOP_OFFSET, vh - CARD_TOP_OFFSET - cardH);
  const cardStyle = { left: cardLeft, top: Math.min(Math.max(wantedTop, CARD_TOP_OFFSET), maxTop), width: cardW };

  // Se portalea a <body> para quedar por encima del portal del modal de HeroUI
  // (`.modal__backdrop` es `fixed inset-0 z-50`) y, sobre todo, para escapar del
  // subárbol que react-aria marca como `inert`. Al abrir un modal, react-aria
  // (`useModalOverlay` → `ariaHideOutside(..., { shouldUseInert: true })`) pone
  // `inert` en todo lo que está fuera del modal: eso NO oculta visualmente (el
  // spotlight se sigue viendo) pero anula los pointer-events, así que sin esto
  // los paneles no capturan el click y este se filtra a los elementos del modal.
  //
  // `data-react-aria-top-layer` es la vía oficial (la usan toasts/top-layer):
  // react-aria mantiene estos nodos siempre visibles y SIN `inert`, de modo que
  // los cuatro paneles vuelven a bloquear todo menos el hueco enfocado.
  return createPortal(
    // El wrapper NO captura clicks (pointer-events-none): así el hueco del
    // elemento enfocado deja pasar el click al elemento real. Solo los cuatro
    // paneles (pointer-events-auto) bloquean todo lo demás.
    // `aria-hidden` only while the layer is pure decoration: with actions in
    // the card it holds focusable buttons, and hiding those from assistive
    // tech would leave the tour with no way out.
    <div
      aria-hidden={footer ? undefined : true}
      data-react-aria-top-layer="true"
      className="pointer-events-none fixed inset-0 z-[9998]"
    >
      {/* Arriba */}
      <div className={panel} style={{ left: 0, right: 0, top: 0, height: top }} />
      {/* Abajo */}
      <div className={panel} style={{ left: 0, right: 0, top: bottom, bottom: 0 }} />
      {/* Izquierda (a la altura del hueco) */}
      <div className={panel} style={{ left: 0, top, width: left, height: bottom - top }} />
      {/* Derecha (a la altura del hueco) */}
      <div className={panel} style={{ left: right, right: 0, top, height: bottom - top }} />
      {/* Explanatory steps also cover the cutout: the element stays visible
          through the transparent pane but the tap never reaches it, so the tour
          cannot be lost to an accidental navigation. */}
      {blockTarget && (
        <div className="pointer-events-auto fixed" style={{ left, top, width: right - left, height: bottom - top }} />
      )}

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
          ref={cardRef}
          className={`fixed z-[10000] -translate-x-1/2 ${footer ? 'pointer-events-auto' : 'pointer-events-none'}`}
          style={cardStyle}
          initial={{ opacity: 0, y: placeAbove ? 6 : -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <TutorialCard dotIndex={dotIndex} dotCount={dotCount} title={title} body={message} footer={footer} />
        </motion.div>
      )}
    </div>,
    document.body,
  );
}
