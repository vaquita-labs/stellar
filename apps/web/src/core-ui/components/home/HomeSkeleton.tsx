'use client';

/**
 * Pantalla de carga de la home: en vez de tapar todo con un modal (la vaquita
 * de <LoaderScreen>), dibuja el ESQUELETO de la propia home — header naranja,
 * fila de stats, cielo con la isla, accesos flotantes y la botonera de abajo —
 * con las mismas medidas y colores que los componentes reales.
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
      <div className="w-full relative shrink-0">
        <div className="w-full px-4 pt-3 pb-3 bg-primary rounded-g">
          <div className="max-w-xl mx-auto flex items-center gap-3">
            <div className="h-14 w-14 shrink-0 rounded-full bg-black/10 animate-pulse" />

            <div className="flex flex-col min-w-0 flex-1 gap-1">
              <div className="h-3 w-28 rounded bg-black/10 animate-pulse" />
              {/* Pastilla del saldo: mismo borde inferior grueso que el botón
                  real, para que no “engorde” al aparecer el número. */}
              <div className="w-40 max-w-full self-start rounded-md border border-black/20 border-b-3 bg-background/60 px-4 py-2">
                <div className="h-5 w-full rounded bg-black/10 animate-pulse" />
              </div>
            </div>

            <div className="h-8 w-8 shrink-0 self-start rounded-full bg-black/10 animate-pulse" />
          </div>
        </div>

        {/* Fila de stats (racha / monedas / experiencia), flotando sobre el
            borde del naranja con el mismo offset en px que la real. */}
        <div className="absolute left-0 right-0 -bottom-[36px] px-1 z-20">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2 bg-white/60 backdrop-blur-md rounded-lg px-3 py-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-1.5 flex-1 justify-center">
                <div className="h-5 w-5 rounded-full bg-black/10 animate-pulse" />
                <div className="h-3 w-8 rounded bg-black/10 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cielo + isla. El degradado es el del ciclo diurno a media mañana: el
          mapa real arranca con su propia hora, así que este es un punto de
          partida neutro y no un flash blanco. */}
      <div className="relative flex-1 min-h-0 bg-linear-to-b from-[#8fc7e3] to-[#cfeaf7] overflow-hidden">
        {/* Accesos rápidos, en la misma posición que en <HeaderStats>.
            A la izquierda NO va un placeholder del reloj: <MapClock> es un ítem
            de la tienda y sólo se muestra a quien lo compró, así que dibujarlo
            acá le prometería un cartel que a la mayoría nunca le aparece. */}
        <div className="absolute left-0 right-0 top-0 mt-[40px] px-1 z-20">
          <div className="max-w-xl mx-auto flex items-start justify-end gap-2">
            <div className="flex flex-col items-center gap-2 md:hidden">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 w-10 rounded-lg bg-white/40 animate-pulse" />
              ))}
            </div>
          </div>
        </div>

        {/* A propósito NO se dibuja una silueta de la isla: cualquier forma que
            la insinúe se lee como un objeto raro del mapa, no como "esto está
            cargando". El cielo vacío ya deja claro dónde va a aparecer. */}
      </div>

      {/* Botonera inferior (Withdraw / Deposit): mismo alto, redondeo y borde
          <DepositPanel>, así el pulgar no ve saltar los botones. */}
      <div className="absolute bottom-4 left-0 w-full flex justify-center">
        <div className="w-full max-w-xl px-1 flex gap-1">
          <div className="h-12 flex-1 rounded-md border border-black/20 border-b-5 bg-white/70 animate-pulse" />
          <div className="h-12 flex-1 rounded-md border border-black/20 border-b-5 bg-black/10 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
