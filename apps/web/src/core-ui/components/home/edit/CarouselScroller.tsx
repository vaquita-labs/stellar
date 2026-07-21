'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

/** Cuánto tarda el indicador en desvanecerse después del último scroll. */
const HIDE_DELAY_MS = 800;

/**
 * Alto del carrusel. Vive acá y no en cada lista porque el catálogo y la
 * colección muestran la MISMA card (preview + píldora de nombre): si cada uno
 * declara su alto, el panel de la tienda cambia de tamaño al cambiar de tab.
 */
const CAROUSEL_HEIGHT = 'h-[160px] sm:h-[180px]';

interface CarouselScrollerProps {
  children: ReactNode;
  /** Clases extra del contenedor scrolleable. */
  className?: string;
}

/**
 * Carrusel horizontal sin barra de scroll nativa: la barra naranja global de
 * globals.css se leía como una franja pegada al panel de la tienda. En su lugar
 * hay un indicador fino, redondeado y discreto que SOLO aparece mientras se
 * scrollea y se desvanece al soltar — si nadie lo mueve, no se ve nada. Cuando
 * el contenido entra entero tampoco se dibuja.
 */
export function CarouselScroller({ children, className = '' }: CarouselScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // null = no hay nada que scrollear (el contenido entra entero).
  const [thumb, setThumb] = useState<{ widthPct: number; leftPct: number } | null>(null);
  const [visible, setVisible] = useState(false);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { clientWidth, scrollWidth, scrollLeft } = el;
    // 1px de tolerancia: los anchos fraccionarios del canvas dan diferencias
    // de sub-píxel que si no dibujarían un indicador de ancho completo.
    if (scrollWidth - clientWidth <= 1) {
      setThumb(null);
      return;
    }
    setThumb({
      widthPct: (clientWidth / scrollWidth) * 100,
      leftPct: (scrollLeft / scrollWidth) * 100,
    });
  }, []);

  const handleScroll = useCallback(() => {
    measure();
    setVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  }, [measure]);

  // El ancho del carrusel depende de cuántos ítems haya (el canvas se
  // redimensiona al comprar o colocar): se remide con ResizeObserver en vez de
  // atarlo a una dependencia de React.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      observer.disconnect();
      clearTimeout(hideTimerRef.current);
    };
  }, [measure]);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`no-scrollbar w-full overflow-x-auto ${CAROUSEL_HEIGHT} ${className}`}
      >
        {children}
      </div>
      {thumb && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-1 bottom-0 h-1 transition-opacity duration-300 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            className="h-full rounded-full bg-black/20"
            style={{ width: `${thumb.widthPct}%`, marginLeft: `${thumb.leftPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
