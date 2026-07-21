'use client';

import { ReactNode } from 'react';

interface TutorialCardProps {
  /** Índice del paso actual (para los dots de progreso). */
  dotIndex?: number;
  /** Total de pasos (para los dots de progreso). Si es 0/undefined no se muestran. */
  dotCount?: number;
  /** Título corto (opcional: los hints guía suelen no llevarlo). */
  title?: ReactNode;
  /** Cuerpo del mensaje. Si es string se resalta la palabra "demo". */
  body: ReactNode;
  /** Contenido extra entre el cuerpo y el footer (recibo/aviso). */
  children?: ReactNode;
  /** Footer accionable (CTA). */
  footer?: ReactNode;
  /** Clases extra del contenedor (ancho/posición las pone quien la usa). */
  className?: string;
}

/**
 * Resalta en negro la palabra "demo" dentro del copy. La palabra es la misma en
 * es/pt/en, así que el match (case-insensitive) cubre todos los idiomas.
 */
function highlightDemo(text: string): ReactNode {
  return text.split(/(demo)/gi).map((part, i) =>
    part.toLowerCase() === 'demo' ? (
      <strong key={i} className="font-semibold text-black">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

/** Dots de progreso del tutorial (lenguaje visual único de todas las tarjetas). */
export function TutorialProgressDots({ dotIndex = 0, dotCount = 0 }: { dotIndex?: number; dotCount?: number }) {
  if (dotCount <= 0) return null;
  return (
    <div className="mb-4 flex items-center gap-1.5">
      {Array.from({ length: dotCount }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i === dotIndex ? 'w-7 bg-primary' : i < dotIndex ? 'w-2 bg-primary/50' : 'w-2 bg-black/15'
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Tarjeta canónica del tutorial: ÚNICO componente visual para todas las
 * "tarjetas" que aparecen durante el flujo, tanto la narración centrada
 * (TutorialOverlay) como los hints pegados a un elemento (TutorialFocusLock).
 * Centraliza el chrome (borde, radio, padding, dots y tipografía) para que todo
 * se vea como una sola pieza. El ancho y la posición los define quien la monta.
 */
export function TutorialCard({ dotIndex, dotCount, title, body, children, footer, className }: TutorialCardProps) {
  return (
    <div className={`w-full rounded-2xl border-2 border-black bg-white p-5 shadow-2xl sm:p-6 ${className ?? ''}`}>
      <TutorialProgressDots dotIndex={dotIndex} dotCount={dotCount} />
      {title && <h2 className="text-xl font-bold text-black sm:text-2xl">{title}</h2>}
      <p className={`text-sm leading-relaxed text-black/70 sm:text-base ${title ? 'mt-2' : ''}`}>
        {typeof body === 'string' ? highlightDemo(body) : body}
      </p>
      {children}
      {footer && <div className="mt-5">{footer}</div>}
    </div>
  );
}
