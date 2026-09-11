'use client';

import { motion, type PanInfo } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ReleaseNote, releaseNoteImageUrl, resolveReleaseNoteText } from '../../../hooks';
import { CarouselScroller } from '../../home/edit/CarouselScroller';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

interface ReleaseNotesModalProps {
  /** De la más nueva a la más vieja. La primera es la que va adelante. */
  notes: ReleaseNote[];
  /** Cerrar ES el acuse: no hay un botón aparte de "entendido". */
  onClose: () => void;
}

/** Cuánto hay que arrastrar (o con cuánta velocidad soltar) para pasar de nota. */
const SWIPE_DISTANCE = 64;
const SWIPE_VELOCITY = 320;

/** Cuánto asoma cada nota de atrás, en px y en escala. */
const PEEK_Y = 12;
const PEEK_SCALE = 0.04;

/**
 * El popup de "qué hay de nuevo": las últimas notas apiladas, la más nueva
 * adelante, con título, texto y un carrusel de imágenes que se pueden agrandar.
 *
 * Se muestran varias y no sólo la última porque el acuse es un único número que
 * sólo avanza: quien se salteó un lanzamiento nunca se iba a enterar de lo que
 * salió. Las de atrás asoman apenas, desplazadas y más chicas, que es lo que
 * hace evidente que hay más de una sin necesidad de explicarlo.
 *
 * Se pasa de una a otra arrastrando de costado. Las tarjetas que quedan atrás
 * no se desmontan: se corren fuera de la vista y vuelven si el usuario arrastra
 * para el otro lado, así que retroceder no cuesta un refetch ni pierde el lugar
 * del carrusel de imágenes.
 *
 * El cuerpo llega como texto plano desde el admin y se pinta con
 * `whitespace-pre-line`, no como HTML: lo escribe una persona en un textarea y
 * renderizarlo como markup abriría una inyección por una vía que no necesita
 * existir para un par de párrafos.
 *
 * El texto NO pasa por i18next: no es una cadena de la app sino contenido que
 * escribe un admin, así que viaja con la nota y se elige acá según el idioma
 * activo. Las imágenes son las mismas para todos los idiomas.
 */
export function ReleaseNotesModal({ notes, onClose }: ReleaseNotesModalProps) {
  const { t, i18n } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  // El visor de imágenes vive acá y no adentro de cada tarjeta: se apila sobre
  // el modal entero, y desde la tarjeta —que está siendo arrastrada— no podría.
  const [index, setIndex] = useState(0);

  const previewTitle = resolveReleaseNoteText(notes[index] ?? notes[0], i18n.language).title;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    // Distancia O velocidad: un flick corto y rápido es un gesto de pasar tan
    // válido como arrastrar media tarjeta, y exigir las dos cosas se siente
    // trabado en pantallas chicas.
    const forward = info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY;
    const back = info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY;
    if (forward) setIndex((i) => Math.min(i + 1, notes.length - 1));
    else if (back) setIndex((i) => Math.max(i - 1, 0));
  };

  return (
    <>
      <AppModal
        open
        onOpenChange={onClose}
        title={t('releaseNotes.title', "What's new")}
        size="md"
        footer={
          <PressableButton variant="primary" size="cta" onClick={onClose}>
            {t('releaseNotes.gotIt', 'Got it')}
          </PressableButton>
        }
      >
        <div className="flex flex-col gap-3">
          {/* Alto fijo: las tarjetas se superponen en absoluto, así que sin él
              la pila no mediría nada y el modal saltaría al pasar de una nota
              corta a una larga. Adentro cada tarjeta scrollea sola. */}
          <div
            className="relative h-[20rem] sm:h-[22rem]"
            // La pila es una sola cosa navegable, no una lista de diálogos.
            role="group"
            aria-roledescription="carousel"
            aria-label={t('releaseNotes.title', "What's new")}
          >
            {notes.map((note, i) => {
              const depth = i - index;
              const isFront = depth === 0;
              return (
                <motion.article
                  key={note.id}
                  className="absolute inset-0 overflow-hidden rounded-xl border border-black/10 bg-white"
                  style={{ zIndex: notes.length - i }}
                  // Las que ya pasaron salen por la izquierda en vez de
                  // desmontarse: arrastrar para el otro lado las trae de vuelta.
                  animate={
                    depth < 0
                      ? { x: '-110%', y: 0, scale: 1, opacity: 0 }
                      : { x: 0, y: depth * PEEK_Y, scale: 1 - depth * PEEK_SCALE, opacity: depth > 2 ? 0 : 1 }
                  }
                  transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                  drag={isFront ? 'x' : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.5}
                  onDragEnd={handleDragEnd}
                  // Sólo la de adelante recibe toques: las de atrás asoman, no
                  // se usan, y sin esto sus botones de imagen serían clicables.
                  aria-hidden={!isFront}
                  inert={!isFront}
                >
                  <NoteCard note={note} onOpenImage={setPreview} />
                </motion.article>
              );
            })}
          </div>

          {notes.length > 1 && (
            <div className="flex items-center justify-center gap-1.5" aria-hidden>
              {notes.map((note, i) => (
                <span
                  key={note.id}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-black' : 'w-1.5 bg-black/20'}`}
                />
              ))}
            </div>
          )}
        </div>
      </AppModal>

      {/* El visor va como hermano, igual que en el board de reportes: se apila
        encima y cerrarlo devuelve a la nota sin desmontarla ni acusarla. */}
      {preview ? (
        <AppModal
          open
          onOpenChange={() => setPreview(null)}
          title={previewTitle}
          size="lg"
          fullScreen
          bodyClassName="flex items-center justify-center bg-black/90 px-0! sm:px-0!"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- lo sirve la API, no pasa por el optimizador */}
          <img src={releaseNoteImageUrl(preview)} alt={previewTitle} className="max-h-full max-w-full object-contain" />
        </AppModal>
      ) : null}
    </>
  );
}

/** Una nota de la pila. Sin estado propio: el visor de imágenes vive arriba. */
function NoteCard({ note, onOpenImage }: { note: ReleaseNote; onOpenImage: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const { title, body } = resolveReleaseNoteText(note, i18n.language);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <h3 className="text-base font-extrabold text-black">{title}</h3>
      <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{body}</p>

      {note.imageIds.length > 0 && (
        // El arrastre de la tarjeta se corta acá: la tira de imágenes scrollea
        // de costado igual que la pila, y sin esto el gesto siempre se lo
        // quedaba la tarjeta y el carrusel no se podía mover.
        <div onPointerDownCapture={(event) => event.stopPropagation()}>
          <CarouselScroller>
            <div className="flex h-full w-max gap-2">
              {note.imageIds.map((id) => (
                // Miniatura como botón y no como <img> suelta: tocarla abre el
                // visor, y así el teclado y los lectores de pantalla también
                // pueden abrirla.
                <button
                  key={id}
                  type="button"
                  onClick={() => onOpenImage(id)}
                  aria-label={t('releaseNotes.openImage', 'Open image')}
                  className="h-full shrink-0 overflow-hidden rounded-xl border border-black/10"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- lo sirve la API, no pasa por el optimizador */}
                  <img src={releaseNoteImageUrl(id)} alt="" loading="lazy" className="h-full w-auto object-cover" />
                </button>
              ))}
            </div>
          </CarouselScroller>
        </div>
      )}
    </div>
  );
}
