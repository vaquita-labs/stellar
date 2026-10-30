'use client';

import { usePollarReadyStore } from '@/networks/stellar/wallet/pollarReady';
import { rampCountries, type RampDirection, type RampRoute } from '@pollar/core';
import { usePollar } from '@pollar/react';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Which countries Pollar can ramp in a direction with OUR credentials.
 *
 * The provider publishes the routes and they change without a redeploy, so
 * asking is more faithful than a build flag. It also covers testnet, where no
 * Bolivian route exists and quotes come back empty: a flag left on there showed
 * a country the user could enter only to buy nothing.
 */

/** Upper-case ISO codes, without repeats or blanks. */
export function rampCountryCodes(routes: RampRoute[] | null | undefined): string[] {
  const codes = rampCountries(routes ?? [])
    .map(({ country }) => country?.trim().toUpperCase())
    .filter((code): code is string => !!code);
  return [...new Set(codes)];
}

/**
 * How long the list is good for before asking again. High on purpose: a country
 * is enabled on the provider's side every few months, and a user who opens the
 * picker twice in a row should not pay for two requests.
 */
export const RAMP_COUNTRIES_STALE_MS = 10 * 60 * 1000;

export interface RampCountriesGate {
  /** `true` while the answer has not arrived. */
  isLoading: boolean;
  /** Does the provider route that country in this direction? Without an answer, no. */
  supports: (country: string) => boolean;
}

/**
 * The provider's countries for one direction, to decide which corridors are offered.
 *
 * Fails CLOSED: while loading, and if the call fails, `supports` answers false
 * and the country shows as "coming soon". Letting the user into a corridor that
 * does not exist sends them to a screen with no way out; one country too few is
 * fixed by retrying.
 *
 * @param enabled keep it `false` until needed, so the list is not fetched on
 * every home render. It is fetched when the user opens a fiat door.
 */
export function useRampCountries(direction: RampDirection, enabled = true): RampCountriesGate {
  const { getClient } = usePollar();
  // The call is signed with the session: without DPoP restored it answers 401,
  // and a retry would be spent on something that could not work yet.
  const ready = usePollarReadyStore((s) => s.ready);

  const { data, isPending } = useQuery({
    queryKey: ['pollar', 'ramp-countries', direction],
    queryFn: async () => rampCountryCodes((await getClient().getRampRoutes(direction)).routes),
    enabled: enabled && ready,
    staleTime: RAMP_COUNTRIES_STALE_MS,
  });

  const supports = useCallback((country: string) => !!data?.includes(country.trim().toUpperCase()), [data]);

  return { isLoading: isPending, supports };
}
