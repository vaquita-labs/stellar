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
 * - Que la cola de modales del home esté libre: el tour, el prompt de plata
 *   ociosa y la hoja del badge pendiente se dispararían en el mismo instante al
 *   entrar, y ni depositar en el vault ni cobrar un premio pueden quedar
 *   tapados por un anuncio. Esos tres están montados en el home, fuera de esta
 *   cadena de gates, así que se coordinan por el store y no por anidamiento.
 *
 * El `done` local es lo que evita el parpadeo: la mutación de acuse ya limpia
 * el cache de forma optimista, pero un refetch en vuelo podría devolver la nota
 * otra vez antes de que el POST llegue.
 */
export function ReleaseNotesGate() {
  const isAuthenticated = useIsAuthenticated();
  const vaultPromptSettled = useModalQueueStore((s) => s.vaultPromptSettled);
  const homeTourSettled = useModalQueueStore((s) => s.homeTourSettled);
  const badgeClaimSettled = useModalQueueStore((s) => s.badgeClaimSettled);
  const [done, setDone] = useState(false);

  const queueClear = vaultPromptSettled && homeTourSettled && badgeClaimSettled;

  const { data: note } = useReleaseNote(isAuthenticated && queueClear && !done);
  const ack = useAckReleaseNote();

  if (!note || done || !queueClear) return null;

  const close = () => {
    setDone(true);
    // Si el POST falla no se muestra un error: la nota vuelve a aparecer en la
    // próxima carga, que es exactamente lo que corresponde cuando el acuse no
    // se pudo registrar.
    ack.mutate(note.id);
  };

  return <ReleaseNotesModal note={note} onClose={close} />;
}
