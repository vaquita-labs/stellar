'use client';

import { isPostHogEnabled } from '@/core-ui/config/featureFlags';
import { useProfileData } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { usePollarReadyStore } from '@/networks/stellar/wallet/pollarReady';
import posthog from 'posthog-js';
import { useEffect, useRef } from 'react';

/**
 * Le pone nombre a la sesión de analytics cuando hay usuario, y se lo saca
 * cuando se va.
 *
 * El `distinct_id` es el id de perfil, NO la dirección de la wallet: la
 * dirección es un identificador público y permanente de la cadena, y usarla de
 * clave del dataset pondría el historial on-chain completo del usuario a un
 * join de distancia en cada export y en cada link de dashboard compartido. Va
 * igual, pero como propiedad de persona: el join sigue disponible y deja de ser
 * automático.
 *
 * No mira `usePollar().wallet` —cambia mientras Pollar restaura la sesión— sino
 * el mismo par que usa `useIdleFunds`: la sesión ya restaurada más la dirección
 * del store de config.
 */
export function PostHogIdentify() {
  const ready = usePollarReadyStore((s) => s.ready);
  const walletAddress = useConfigStore((s) => s.walletAddress);
  const { data: profile } = useProfileData();
  const identified = useRef<string | null>(null);

  useEffect(() => {
    if (!isPostHogEnabled()) return;

    // Se fue: sin el reset, el próximo usuario de un dispositivo compartido
    // sigue escribiendo eventos sobre la persona anterior.
    if (!walletAddress) {
      if (identified.current) {
        identified.current = null;
        posthog.reset();
      }
      return;
    }

    if (!ready || !profile?.id) return;
    const id = String(profile.id);
    if (identified.current === id) return;
    identified.current = id;
    posthog.identify(id, { wallet_address: walletAddress });
  }, [ready, walletAddress, profile?.id]);

  return null;
}
