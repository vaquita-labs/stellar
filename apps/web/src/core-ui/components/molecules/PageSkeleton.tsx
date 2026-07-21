'use client';

/**
 * Pantalla de carga de las páginas internas (leaderboard, explorar,
 * notificaciones, transacciones, perfil…). Todas comparten el chrome de
 * <PageLayout> —back circular + título centrado— así que eso se dibuja una
 * sola vez acá; lo que cambia es la forma del contenido:
 *
 *   'rows'  filas finas (leaderboard, notificaciones, transacciones)
 *   'cards' tarjetas altas con preview del mapa y stats (explorar)
 *
 * La variante importa: si el arranque muestra filas y la página después pinta
 * tarjetas, la carga se ve como dos pantallas distintas encadenadas. Cada
 * variante replica las medidas del skeleton propio de esa página
 * (<LeagueBoardSkeleton>, <LeaderboardCardSkeleton>) para que el relevo no se
 * note.
 *
 * NO usa `useTranslation`: se monta en el arranque, antes del I18nProvider, y
 * un `t()` con i18n a medio inicializar devolvería la clave cruda en pantalla.
 * Por eso el título también es un bloque gris y no texto. Por lo mismo no
 * importa los skeletons reales de pages/: arrastrarían medio árbol de la
 * página al bundle inicial de TODAS las rutas.
 */
export type PageSkeletonVariant = 'rows' | 'cards' | 'map';

export function PageSkeleton({
  variant = 'rows',
  rows = variant === 'cards' ? 2 : 7,
}: {
  variant?: PageSkeletonVariant;
  rows?: number;
}) {
  // El mapa de otro usuario (/explore/<username>) no es una lista: es una
  // cabecera naranja con su avatar y stats, y debajo el mapa a pantalla
  // completa. Tiene su propio esqueleto porque no comparte el chrome de
  // <PageLayout>.
  if (variant === 'map') return <UserMapPlaceholder />;

  return (
    <div className="h-full overflow-hidden" role="status" aria-busy="true" aria-live="polite">
      <div className="mx-auto w-full min-h-full max-w-2xl px-4 py-6 sm:py-8 flex flex-col gap-2 pb-10">
        {/* Header: mismas medidas que <PageHeader> (back de 32px a la
            izquierda, título centrado) para que no salte al aparecer. */}
        <div className="relative flex items-center justify-center min-h-8 px-11 mb-1">
          <div className="absolute left-0 h-8 w-8 rounded-full bg-black/10 animate-pulse" />
          <div className="h-4 w-32 rounded bg-black/10 animate-pulse" />
        </div>

        <div className={`flex flex-col ${variant === 'cards' ? 'gap-3' : 'gap-1.5'}`}>
          {Array.from({ length: rows }).map((_, i) =>
            variant === 'cards' ? <CardPlaceholder key={i} /> : <RowPlaceholder key={i} />,
          )}
        </div>
      </div>
    </div>
  );
}

/** Perfil ajeno: cabecera con avatar + stats y el mapa ocupando el resto. */
function UserMapPlaceholder() {
  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden min-h-0"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="w-full shrink-0 flex flex-col gap-2 pb-2">
        <header className="bg-primary px-3 sm:px-6 py-3 rounded-b-3xl border-b-2 border-black/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 shrink-0 rounded-full bg-white/50 animate-pulse" />
            <div className="h-14 w-14 shrink-0 rounded-full bg-black/10 animate-pulse" />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="h-4 w-32 max-w-full rounded bg-black/10 animate-pulse" />
              <div className="h-3 w-20 max-w-full rounded bg-black/10 animate-pulse" />
            </div>
          </div>
        </header>

        <div className="w-full max-w-xl mx-auto px-3 sm:px-4 flex gap-2">
          <div className="h-10 flex-1 rounded-xl border border-black/10 bg-white animate-pulse" />
          <div className="h-10 flex-1 rounded-xl border border-black/10 bg-white animate-pulse" />
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full bg-linear-to-b from-[#8fc7e3] to-[#cfeaf7]" />
    </div>
  );
}

/** Fila de ranking: posición · avatar · nombre · puntaje. */
function RowPlaceholder() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-3 py-2.5 animate-pulse">
      <span className="h-3 w-4 rounded bg-black/10" />
      <span className="h-10 w-10 rounded-full bg-black/10" />
      <span className="h-3 flex-1 rounded bg-black/10" />
      <span className="h-3 w-12 rounded bg-black/10" />
    </div>
  );
}

/** Tarjeta de perfil: cabecera + preview del mapa + fila de stats + chips. */
function CardPlaceholder() {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-black/10 bg-white p-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-black/10" />
        <div className="h-3 flex-1 rounded bg-black/10" />
        <div className="h-6 w-16 rounded-full bg-black/10" />
      </div>
      <div className="w-full aspect-[16/9] rounded-lg bg-black/10" />
      <div className="flex gap-2">
        <div className="h-8 flex-1 rounded-lg bg-black/5" />
        <div className="h-8 flex-1 rounded-lg bg-black/5" />
        <div className="h-8 flex-1 rounded-lg bg-black/5" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-14 rounded-full bg-black/5" />
        <div className="h-6 w-14 rounded-full bg-black/5" />
      </div>
    </div>
  );
}
