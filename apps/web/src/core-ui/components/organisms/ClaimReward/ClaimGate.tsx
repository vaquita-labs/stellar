'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { useIsAuthenticated, useProfileData, useRestProfile } from '../../../hooks';
import { ProfileResponseDTO } from '../../../types';
import { ClaimRewardModal } from './ClaimRewardModal';

/**
 * Último paso del onboarding: tras el tutorial, ofrece reclamar el regalo de
 * bienvenida (1 USDC) la primera vez que el usuario llega al home. Se gobierna
 * con el flag `onboardingCompleted` del backend; al reclamar/saltar se marca
 * para que no vuelva a aparecer.
 */
export function ClaimGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();
  const { saveProfileFlags } = useRestProfile();
  const { data, isLoading, isError } = useProfileData();

  const [done, setDone] = useState(false);

  const needsClaim =
    isAuthenticated &&
    !isLoading &&
    !isError &&
    !!data &&
    data.tutorialCompleted &&
    !data.onboardingCompleted &&
    !done;

  const finish = async () => {
    setDone(true);
    await saveProfileFlags({ onboardingCompleted: true });
    // Optimista: marcamos completado en cache para que no reaparezca mientras
    // el refetch del perfil viaja.
    queryClient.setQueryData<ProfileResponseDTO>(
      ['profile', data?.networkName, data?.walletAddress, 'profile-data'],
      (old) => (old ? { ...old, onboardingCompleted: true } : old),
    );
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  return (
    <>
      {children}
      {needsClaim && <ClaimRewardModal onDone={finish} />}
    </>
  );
}
