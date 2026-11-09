import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';
import type { AvatarConfig } from '@vaquita/avatar';
import { nicknameSegment } from '@/core-ui/helpers/nickname';

/** Lo que se guarda de la respuesta: la dirección y con qué cara mostrarla. */
type ResolvedProfile = { walletAddress: string; avatarConfig?: AvatarConfig };

/** Stellar public keys: `G` + 55 base32 chars. */
const STELLAR_WALLET_RE = /^G[A-Z2-7]{55}$/;

/**
 * Resolves the `/leaderboard/[username]` URL segment to a wallet address.
 *
 * Usernames are the public identifier now, but every profile/world query is
 * keyed by wallet — so the page resolves once here and reuses the existing
 * per-wallet hooks. Old shared links still carry a raw wallet; those pass
 * through without a network round-trip.
 *
 * Returns `notFound: true` when the backend reports no profile for the
 * username (deleted account or a stale/mistyped link).
 *
 * `avatarConfig` viene en la misma respuesta, así que quien quiera mostrar a
 * la persona que acaba de resolver no necesita otro pedido. Para una dirección
 * cruda no hay perfil consultado y queda `undefined`.
 */
export const useWalletByUsername = (username: string) => {
  const isWallet = STELLAR_WALLET_RE.test(username.trim().toUpperCase());
  // El `@` es legal en la UI pero no en un nickname, así que mandarlo tal cual
  // a la API da 404. El segmento de URL nunca lo trae, por eso nunca se notó —
  // el campo de destino del envío sí.
  const segment = nicknameSegment(username);

  const query = useQuery<ResolvedProfile | null>({
    // La key lleva `profile` porque el valor guardado cambió de forma (antes
    // era solo la dirección): con la key vieja, un string persistido en el
    // cache de localStorage se leería como si fuera este objeto.
    queryKey: ['profile-by-username', segment, 'profile'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/nickname/${encodeURIComponent(segment)}`
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Failed to resolve username');
      const data = await response.json();
      const walletAddress = (data?.data?.walletAddress as string) || null;
      if (!walletAddress) return null;
      return { walletAddress, avatarConfig: data?.data?.avatarConfig as AvatarConfig | undefined };
    },
    enabled: !isWallet && !!segment,
    // The mapping breaks if the user renames themselves, so revalidate on
    // mount instead of trusting the persisted Infinity-stale cache.
    staleTime: 0,
    refetchOnMount: 'always',
  });

  if (isWallet) {
    return { walletAddress: username.trim(), avatarConfig: undefined, isLoading: false, notFound: false };
  }

  return {
    walletAddress: query.data?.walletAddress ?? null,
    avatarConfig: query.data?.avatarConfig,
    isLoading: query.isLoading,
    notFound: query.isSuccess && query.data === null,
  };
};
