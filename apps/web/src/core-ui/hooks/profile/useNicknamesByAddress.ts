'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

/**
 * Current nickname of each address that belongs to a Vaquita profile.
 *
 * A saved wallet stores an address plus a label the user typed once. The label
 * is a snapshot: someone who renames themselves keeps the same address, and a
 * freed nickname can be taken by somebody else — so a stored `@name` can end up
 * naming the wrong person over a perfectly valid address. Resolving the name
 * from the address at render time is what keeps the two in sync.
 *
 * It also answers a question the label cannot: whether a destination is a
 * Vaquita user at all. An address with no profile is an exchange or a wallet of
 * their own, and its stored label is the only name it will ever have.
 *
 * A 404 is an answer, not a failure: it means "not a user". Anything else
 * (offline, 500) resolves to `null` for that address, so the caller keeps
 * showing the stored label instead of dropping a destination off the screen.
 */
export const useNicknamesByAddress = (addresses: string[]) => {
  // Ordered + deduped so the query set is stable across renders: the same saved
  // wallets in a different order would otherwise remount every query.
  const unique = useMemo(() => Array.from(new Set(addresses.filter(Boolean))).sort(), [addresses]);

  const results = useQueries({
    queries: unique.map((address) => ({
      queryKey: ['nickname-by-address', address],
      queryFn: async (): Promise<string | null> => {
        const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${address}`);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Profile lookup failed (${response.status})`);
        const data = await response.json();
        const nickname = data?.data?.nickname;
        return typeof nickname === 'string' && nickname ? nickname : null;
      },
      // Renames are rare but the whole point here is not serving a stale name,
      // so this revalidates on mount rather than trusting the persisted cache.
      staleTime: 60_000,
      refetchOnMount: 'always' as const,
      retry: 1,
    })),
  });

  return useMemo(() => {
    // Only settled addresses get an entry. A key that is absent means the
    // lookup has not answered yet, which the caller must not read as "not a
    // user" — that would move a destination between lists while it loads.
    //
    // A lookup that FAILED settles as `null`, the same as an address with no
    // profile. The name stays unknown either way, but an address in no list at
    // all disappears from the screen: the withdrawal screen would tell someone
    // with saved destinations that they have none, and re-adding one hits the
    // unique on (profile, address, network) with a 409. The stored label is a
    // good enough name to fall back on until the lookup answers.
    const byAddress = new Map<string, string | null>();
    unique.forEach((address, i) => {
      const result = results[i];
      if (result?.isSuccess) byAddress.set(address, result.data ?? null);
      else if (result?.isError) byAddress.set(address, null);
    });
    return {
      /** address → nickname; `null` when it is not a user or the lookup failed, absent while it loads. */
      nicknames: byAddress,
      isLoading: results.some((r) => r.isLoading),
    };
  }, [unique, results]);
};
