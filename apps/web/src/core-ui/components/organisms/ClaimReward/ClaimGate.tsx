'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { useIsAuthenticated, useProfileData, useRestProfile } from '../../../hooks';
import { useAutoModalSlot } from '../../../stores';
import { ProfileResponseDTO } from '../../../types';
import { ClaimRewardModal } from './ClaimRewardModal';

/**
 * Último paso del onboarding: tras el tutorial, ofrece reclamar el regalo de
 * bienvenida (1 USDC) la primera vez que el usuario llega al home. Se gobierna
 * con el flag `onboardingCompleted` del backend; al reclamar/saltar se marca
 * para que no vuelva a aparecer.
 *
 * Su lugar en la cola de modales que se abren solos está en [[auto-modals]]:
 * espera al permiso de notificaciones y al tour, y el prompt de dinero ocioso y
 * el badge pendiente esperan a este.
 */
export function ClaimGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();
  const { saveProfileFlags } = useRestProfile();
  const { data, isFetchedAfterMount, isError } = useProfileData();

  const [done, setDone] = useState(false);

  // `isFetchedAfterMount` y no el perfil que ya estaba en cache: se persiste
  // entre cargas y se revalida al montar, así que la copia vieja puede decir
  // que el onboarding está cerrado cuando el servidor dice que no. Decidir
  // sobre ella soltaría el turno antes de que llegue la respuesta fresca, y el
  // badge se abriría encima del regalo que aparece un instante después.
  const answered = isFetchedAfterMount;

  const needsClaim =
    isAuthenticated && answered && !isError && !!data && data.tutorialCompleted && !data.onboardingCompleted && !done;

  // Nadie le reserva el lugar: este gate monta en el layout privado, o sea
  // antes que el home. Lo retiene mientras el perfil no contesta, y `ourTurn`
  // es el permiso de notificaciones y el tour ya fuera del camino — el orden
  // completo vive en [[auto-modals]].
  const ourTurn = useAutoModalSlot('welcome-claim', answered && !needsClaim);

  const showClaim = needsClaim && ourTurn;

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
