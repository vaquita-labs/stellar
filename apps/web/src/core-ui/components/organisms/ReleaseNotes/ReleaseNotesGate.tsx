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
 * - Que el backend devuelva una nota pendiente (o sea: hay una publicada y este
 *   usuario todavía no la cerró). Toda la lógica de "cuál" vive allá. Esa nota
 *   es sólo el disparador: lo que se muestra son las tres últimas apiladas, con
 *   la más nueva adelante, así que quien se salteó un lanzamiento se entera
 *   igual. El acuse sigue siendo uno solo y es el de la más nueva.
 * - Que la cola de modales del home esté libre: el pedido de permiso de
 *   notificaciones, el tour, el prompt de dinero ocioso y la hoja del badge
 *   pendiente se dispararían en el mismo instante al entrar, y ni activar las
 *   notificaciones ni depositar en el vault ni cobrar un premio pueden quedar
 *   tapados por un anuncio. Esos cuatro están montados en el home, fuera de
 *   esta cadena de gates, así que se coordinan por el store y no por
 *   anidamiento.
 *
 * El `done` local es lo que evita el parpadeo: la mutación de acuse ya limpia
 * el cache de forma optimista, pero un refetch en vuelo podría devolver la nota
 * otra vez antes de que el POST llegue.
 */
export function ReleaseNotesGate() {
  const isAuthenticated = useIsAuthenticated();
  const pushNudgeSettled = useModalQueueStore((s) => s.pushNudgeSettled);
  const vaultPromptSettled = useModalQueueStore((s) => s.vaultPromptSettled);
  const homeTourSettled = useModalQueueStore((s) => s.homeTourSettled);
  const welcomeClaimSettled = useModalQueueStore((s) => s.welcomeClaimSettled);
  const badgeClaimSettled = useModalQueueStore((s) => s.badgeClaimSettled);
  const [done, setDone] = useState(false);

  const queueClear = pushNudgeSettled && vaultPromptSettled && homeTourSettled && welcomeClaimSettled && badgeClaimSettled;

  const { data } = useReleaseNote(isAuthenticated && queueClear && !done);
  const ack = useAckReleaseNote();

  const note = data?.note ?? null;
  // La pila no puede quedar vacía cuando hay disparador: si el backend devolvió
  // una nota pendiente pero `notes` llegó vacío (una respuesta vieja, cacheada
  // antes de que existiera el campo), se muestra esa sola.
  const notes = data?.notes?.length ? data.notes : note ? [note] : [];

  if (!note || done || !queueClear) return null;

  const close = () => {
    setDone(true);
    // Si el POST falla no se muestra un error: la nota vuelve a aparecer en la
    // próxima carga, que es exactamente lo que corresponde cuando el acuse no
    // se pudo registrar.
    ack.mutate(note.id);
  };

  return <ReleaseNotesModal notes={notes} onClose={close} />;
}
