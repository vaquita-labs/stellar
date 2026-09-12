'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { useIsAuthenticated, useProfileData, useRestProfile } from '../../../hooks';
import { useModalQueueStore } from '../../../stores';
import { ProfileResponseDTO } from '../../../types';
import { ClaimRewardModal } from './ClaimRewardModal';

/**
 * Último paso del onboarding: tras el tutorial, ofrece reclamar el regalo de
 * bienvenida (1 USDC) la primera vez que el usuario llega al home. Se gobierna
 * con el flag `onboardingCompleted` del backend; al reclamar/saltar se marca
 * para que no vuelva a aparecer.
 *
 * Su lugar en la cola de modales que se abren solos está en [[modal-queue]]:
 * espera al permiso de notificaciones y al tour, y el prompt de dinero ocioso y
 * el badge pendiente esperan a este.
 */
export function ClaimGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();
  const { saveProfileFlags } = useRestProfile();
  const { data, isFetchedAfterMount, isError } = useProfileData();

  // Detrás del permiso de notificaciones y del tour: el pedido de push vence si
  // se tapa, y los coach marks ocupan la pantalla entera.
  const pushNudgeSettled = useModalQueueStore((s) => s.pushNudgeSettled);
  const homeTourSettled = useModalQueueStore((s) => s.homeTourSettled);
  const setWelcomeClaimSettled = useModalQueueStore((s) => s.setWelcomeClaimSettled);

  const [done, setDone] = useState(false);

  // `isFetchedAfterMount` y no el perfil que ya estaba en cache: se persiste
  // entre cargas y se revalida al montar, así que la copia vieja puede decir
  // que el onboarding está cerrado cuando el servidor dice que no. Decidir
  // sobre ella soltaría el turno antes de que llegue la respuesta fresca, y el
  // badge se abriría encima del regalo que aparece un instante después.
  const answered = isFetchedAfterMount;

  const needsClaim =
    isAuthenticated && answered && !isError && !!data && data.tutorialCompleted && !data.onboardingCompleted && !done;

  // El turno se toma y se suelta acá mismo: este gate monta en el layout
  // privado, o sea antes que el home, así que no necesita que nadie se lo
  // reserve. Mientras el perfil no contesta lo retiene, y al desmontar lo
  // devuelve para no dejar la cola trabada fuera del árbol privado.
  useEffect(() => {
    setWelcomeClaimSettled(answered && !needsClaim);
  }, [answered, needsClaim, setWelcomeClaimSettled]);

  useEffect(() => () => setWelcomeClaimSettled(true), [setWelcomeClaimSettled]);

  const showClaim = needsClaim && pushNudgeSettled && homeTourSettled;

  const finish = async () => {
    setDone(true);
    await saveProfileFlags({ onboardingCompleted: true });
    // Optimista: marcamos completado en cache para que no reaparezca mientras
    // el refetch del perfil viaja.
    queryClient.setQueryData<ProfileResponseDTO>(['profile', data?.networkName, data?.walletAddress, 'profile-data'], (old) =>
      old ? { ...old, onboardingCompleted: true } : old,
    );
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  return (
    <>
      {children}
      {showClaim && <ClaimRewardModal onDone={finish} />}
    </>
  );
}
