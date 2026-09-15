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
 * Its place among the modals that open on their own is in [[auto-modals]]: it
 * waits for the notification ask and the tour, and the idle-money prompt and the
 * pending badge wait for it.
 */
export function ClaimGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();
  const { saveProfileFlags } = useRestProfile();
  const { data, isFetchedAfterMount, isError } = useProfileData();

  const [done, setDone] = useState(false);

  // `isFetchedAfterMount`, not the profile already in the cache: it is persisted
  // across loads and revalidated on mount, so the stale copy can say onboarding
  // is closed when the server says it is not. Deciding on that would hand the
  // turn away before the fresh answer lands, and the badge sheet would open on
  // top of the gift that appears an instant later.
  const answered = isFetchedAfterMount;

  const needsClaim =
    isAuthenticated && answered && !isError && !!data && data.tutorialCompleted && !data.onboardingCompleted && !done;

  // Nobody reserves this one: the gate mounts in the private layout, before the
  // home does. It holds the slot while the profile has not answered, and
  // `ourTurn` is the notification ask and the tour being out of the way — the
  // full order is in [[auto-modals]].
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
