'use client';

/**
 * Pantalla de carga de /profile. No usa <PageSkeleton> porque el perfil no es
 * una lista dentro del chrome de <PageLayout>: es un banner a sangre con el
 * avatar, la línea del handle, la fila de stats, la botonera de amigos y dos
 * tarjetas (resumen de 3 ítems y grilla de 4 logros). Replicarlo acá es lo que
 * hace que al llegar los datos nada se mueva de lugar.
 *
 * El color del banner real sale de la paleta del avatar del usuario, que en el
 * arranque todavía no se conoce: por eso acá es un gris neutro y no un color
 * inventado que después cambie de golpe.
 *
 * Sin `useTranslation`: se monta antes del I18nProvider (ver <PageSkeleton>).
 */
export function ProfileSkeleton() {
  return (
    <div
      className="h-full overflow-hidden bg-background"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mx-auto w-full max-w-2xl pb-28 md:pb-12 flex flex-col gap-6">
        {/* Banner: el avatar ocupa el ancho hasta 15.5rem, con el back a la
            izquierda, el título al centro y ajustes a la derecha. */}
        <header className="relative bg-black/5">
          {/* pt-11 + 15.25rem de alto: el mismo alto total que el banner con el
              avatar real, para que el corte con el fondo de la página caiga en
              el mismo punto y el resto no se desplace. Cabeza y hombros por
              separado — una sola silueta se lee como una campana, no como un
              personaje. */}
          <div className="pt-11">
            <div className="relative mx-auto h-[15.25rem] w-full max-w-[15.5rem]">
              <div className="absolute left-1/2 top-2 h-32 w-32 -translate-x-1/2 rounded-full bg-black/10 animate-pulse" />
              <div className="absolute inset-x-6 bottom-0 h-24 rounded-t-[3rem] bg-black/10 animate-pulse" />
            </div>
          </div>
          <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-4 pt-4 sm:px-6">
            <div className="flex flex-1 basis-0 justify-start">
              <div className="h-9 w-9 rounded-full bg-white/70 animate-pulse" />
            </div>
            <div className="mx-auto h-6 w-24 rounded bg-black/10 animate-pulse" />
            <div className="flex flex-1 basis-0 justify-end">
              <div className="h-9 w-9 rounded-full bg-white/70 animate-pulse" />
            </div>
          </div>
        </header>

        {/* Handle + fecha de alta */}
        <section className="-mt-2 px-4 sm:px-6">
          <div className="h-4 w-56 max-w-full rounded bg-black/10 animate-pulse" />
        </section>

        {/* Fila de stats: siguiendo · seguidores · likes, con sus separadores */}
        <section className="px-4 sm:px-6">
          <div className="flex items-stretch gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="contents">
                {i > 0 && <span className="w-px bg-black/10" aria-hidden />}
                <div className="flex flex-1 min-w-0 flex-col items-center gap-1.5 py-1">
                  <div className="h-5 w-8 rounded bg-black/10 animate-pulse" />
                  <div className="h-3 w-16 rounded bg-black/10 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Agregar amigos + compartir QR */}
        <section className="flex items-stretch gap-3 px-4 sm:px-6">
          <div className="h-12 flex-1 rounded-md border border-black/20 border-b-3 bg-white animate-pulse" />
          <div className="h-12 w-12 rounded-md border border-black/20 border-b-3 bg-white animate-pulse" />
        </section>

        {/* Resumen: racha · oro · experiencia */}
        <section className="px-4 sm:px-6 flex flex-col gap-3">
          <div className="h-3 w-24 rounded bg-black/10 animate-pulse" />
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-black/20 border-b-2 bg-white p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="h-7 w-7 rounded-full bg-black/10 animate-pulse" />
                <div className="h-3 w-12 rounded bg-black/10 animate-pulse" />
                <div className="h-3 w-10 rounded bg-black/5 animate-pulse" />
              </div>
            ))}
          </div>
        </section>

        {/* Logros: grilla de 4 medallas */}
        <section className="px-4 sm:px-6 flex flex-col gap-3">
          <div className="h-3 w-28 rounded bg-black/10 animate-pulse" />
          <div className="rounded-2xl border border-black/20 border-b-2 bg-white p-4">
            <div className="grid grid-cols-4 gap-2 sm:gap-4 place-items-center">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-14 w-14 rounded-xl bg-black/10 animate-pulse" />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
