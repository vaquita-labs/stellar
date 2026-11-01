'use client';

/**
 * Pantalla de carga de la home: en vez de tapar todo con un modal (la vaquita
 * de <LoaderScreen>), dibuja el ESQUELETO del tablero — header naranja con
 * avatar y saludo, tarjeta del saldo, botonera, franja del gráfico y últimos
 * movimientos — con las mismas medidas y colores que <HeaderStats> y
 * <HomeDashboard>.
 *
 * Se ve como la pantalla que está por aparecer, así que la carga se entiende
 * sin leer nada y no hay salto de layout cuando llegan los datos: los bloques
 * se rellenan en su sitio.
 *
 * Es puramente visual: no consulta datos ni gatea nada. Lo usan los gates del
 * arranque (auth → config → perfil → reloj de juego) a través de <BootLoader>.
 */
export function HomeSkeleton() {
  return (
    <div
      // Alto explícito (no `h-full`): el esqueleto también se monta como raíz
      // del AppShell, donde no hereda el alto del <main>.
      style={{ height: 'var(--100VH)', maxHeight: 'var(--100VH)' }}
      className="w-full flex flex-col relative overflow-hidden min-h-0 bg-background"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Header naranja: mismas clases que <HeaderStats> para que el bloque de
          color no se mueva ni un píxel al cambiar al real. */}
      <div className="w-full px-4 pt-2 pb-2 bg-primary rounded-g shrink-0">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 rounded-full bg-black/10 animate-pulse" />
          <div className="flex min-w-0 flex-1">
            <div className="h-4 w-32 rounded bg-black/10 animate-pulse" />
          </div>
          {/* Campana y ayuda. */}
          <div className="flex shrink-0 items-center gap-2 self-center">
            <div className="h-8 w-8 rounded-full bg-black/10 animate-pulse" />
            <div className="h-8 w-8 rounded-full bg-black/10 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Tablero: mismo padding y separación que <HomeDashboard>. */}
      <div className="flex h-full w-full flex-col gap-3 overflow-hidden px-4 pb-6 pt-4">
        {/* Tarjeta del saldo. */}
        <div className="flex items-center gap-2 rounded-lg border border-black/20 border-b-2 bg-white px-4 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-9 w-44 rounded bg-black/10 animate-pulse" />
            <div className="h-4 w-36 rounded bg-black/10 animate-pulse" />
          </div>
          <div className="h-5 w-5 rounded bg-black/10 animate-pulse" />
        </div>

        {/* Depositar / Retirar. */}
        <div className="flex w-full max-w-xl gap-2">
          <div className="h-12 flex-1 rounded-md border border-black/20 border-b-4 bg-black/10 animate-pulse" />
          <div className="h-12 flex-1 rounded-md border border-black/20 border-b-4 bg-white/70 animate-pulse" />
        </div>

        {/* Gráfico de ganancias: barras del mismo ancho, alineadas abajo, y las
            pestañas del período. */}
        <div className="flex flex-col gap-3 py-2">
          <div className="flex h-72 items-end gap-2 overflow-hidden">
            {[35, 50, 42, 60, 48, 70].map((h, i) => (
              <div key={i} className="flex h-full w-[calc((100%-2.5rem)/6)] shrink-0 flex-col items-center justify-end gap-1">
                <div
                  style={{ height: `${h}%` }}
                  className="w-full rounded-md border border-black/10 bg-black/10 animate-pulse"
                />
                <div className="h-2.5 w-7 rounded bg-black/10 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="mx-auto h-8 w-56 rounded-lg bg-black/10 animate-pulse" />
        </div>

        {/* Últimos movimientos. */}
        <div className="rounded-2xl bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-36 rounded bg-black/10 animate-pulse" />
            <div className="h-3 w-12 rounded bg-black/10 animate-pulse" />
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-black/10 animate-pulse" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="h-3.5 w-28 rounded bg-black/10 animate-pulse" />
                  <div className="h-3 w-20 rounded bg-black/10 animate-pulse" />
                </div>
                <div className="h-3.5 w-14 rounded bg-black/10 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
