'use client';

import { useState } from 'react';
import { useAckReleaseNote, useIsAuthenticated, useReleaseNote } from '../../../hooks';
import { useModalQueueStore } from '../../../stores';
import { ReleaseNotesModal } from './ReleaseNotesModal';

/**
 * Decide si toca mostrar la nota de versión.
 *
 * Dos cosas hacen falta y ninguna alcanza sola:
 *
 * - Que el backend devuelva una nota (o sea: hay una publicada y este usuario
 *   todavía no la cerró). Toda la lógica de "cuál" vive allá.
 * - Que el prompt de plata ociosa ya se haya resuelto. Los dos modales se
 *   dispararían en el mismo instante al entrar al home, y depositar en el vault
 *   es la decisión que no puede quedar tapada por un anuncio. `AutoInvest` está
 *   montado en el home, fuera de esta cadena de gates, así que se coordinan por
 *   el store y no por anidamiento.
 *
 * El `done` local es lo que evita el parpadeo: la mutación de acuse ya limpia
 * el cache de forma optimista, pero un refetch en vuelo podría devolver la nota
 * otra vez antes de que el POST llegue.
 */
export function ReleaseNotesGate() {
  const isAuthenticated = useIsAuthenticated();
  const vaultPromptSettled = useModalQueueStore((s) => s.vaultPromptSettled);
  const homeTourSettled = useModalQueueStore((s) => s.homeTourSettled);
  const [done, setDone] = useState(false);

  const { data: note } = useReleaseNote(isAuthenticated && vaultPromptSettled && homeTourSettled && !done);
  const ack = useAckReleaseNote();

  if (!note || done || !vaultPromptSettled || !homeTourSettled) return null;

  const close = () => {
    setDone(true);
    // Si el POST falla no se muestra un error: la nota vuelve a aparecer en la
    // próxima carga, que es exactamente lo que corresponde cuando el acuse no
    // se pudo registrar.
    ack.mutate(note.id);
  };

  return <ReleaseNotesModal note={note} onClose={close} />;
}
