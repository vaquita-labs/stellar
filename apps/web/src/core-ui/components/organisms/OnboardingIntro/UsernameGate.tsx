'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useIsAuthenticated, useProfileData } from '../../../hooks';
import { UsernamePrompt } from './UsernamePrompt';

/**
 * Después del login, si el perfil no tiene nickname/username,
 * pide elegir uno antes de dejar entrar a la app.
 */
export function UsernameGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useProfileData();

  const needsUsername =
    isAuthenticated && !isLoading && !isError && !!data && !data.nickname?.trim();

  if (needsUsername) {
    return (
      <UsernamePrompt
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: ['profile'] });
        }}
      />
    );
  }

  return <>{children}</>;
}
