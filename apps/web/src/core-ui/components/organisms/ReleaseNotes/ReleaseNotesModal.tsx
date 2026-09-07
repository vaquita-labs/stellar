'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ReleaseNote, releaseNoteImageUrl } from '../../../hooks';
import { CarouselScroller } from '../../home/edit/CarouselScroller';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

interface ReleaseNotesModalProps {
  note: ReleaseNote;
  /** Cerrar ES el acuse: no hay un botón aparte de "entendido". */
  onClose: () => void;
}

/**
 * El popup de "qué hay de nuevo": título, texto y un carrusel de imágenes que
 * se pueden agrandar.
 *
 * El cuerpo llega como texto plano desde el admin y se pinta con
 * `whitespace-pre-line`, no como HTML: lo escribe una persona en un textarea y
 * renderizarlo como markup abriría una inyección por una vía que no necesita
 * existir para un par de párrafos.
 */
export function ReleaseNotesModal({ note, onClose }: ReleaseNotesModalProps) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <>
      <AppModal
        open
        onOpenChange={onClose}
        title={note.title}
        size="md"
        footer={
          <PressableButton variant="primary" size="cta" onClick={onClose}>
            {t('releaseNotes.gotIt', 'Got it')}
          </PressableButton>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{note.body}</p>

          {note.imageIds.length > 0 && (
            <CarouselScroller>
              <div className="flex h-full w-max gap-2">
                {note.imageIds.map((id) => (
                  // Miniatura como botón y no como <img> suelta: tocarla abre el
                  // visor, y así el teclado y los lectores de pantalla también
                  // pueden abrirla.
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreview(id)}
                    aria-label={t('releaseNotes.openImage', 'Open image')}
                    className="h-full shrink-0 overflow-hidden rounded-xl border border-black/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- lo sirve la API, no pasa por el optimizador */}
                    <img src={releaseNoteImageUrl(id)} alt="" loading="lazy" className="h-full w-auto object-cover" />
                  </button>
                ))}
              </div>
            </CarouselScroller>
          )}
        </div>
      </AppModal>

      {/* El visor va como hermano, igual que en el board de reportes: se apila
        encima y cerrarlo devuelve a la nota sin desmontarla ni acusarla. */}
      {preview ? (
        <AppModal
          open
          onOpenChange={() => setPreview(null)}
          title={note.title}
          size="lg"
          fullScreen
          bodyClassName="flex items-center justify-center bg-black/90 px-0! sm:px-0!"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- lo sirve la API, no pasa por el optimizador */}
          <img src={releaseNoteImageUrl(preview)} alt={note.title} className="max-h-full max-w-full object-contain" />
        </AppModal>
      ) : null}
    </>
  );
}
