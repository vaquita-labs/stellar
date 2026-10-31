'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { useQuery } from '@tanstack/react-query';

export type EarningsPeriod = 'daily' | 'monthly' | 'yearly';

/** Buckets fetched per period: enough to swipe back in time, the chart shows the latest first. */
export const EARNINGS_BARS: Record<EarningsPeriod, number> = { daily: 30, monthly: 12, yearly: 5 };

export interface DefiEarningsBucket {
  start: string;
  end: string;
  earned: number;
  /** No balance reading inside the bucket: its figure is interpolated or carried forward. */
  estimated: boolean;
}

export interface DefiEarningsDTO {
  currency: 'USDC';
  period: EarningsPeriod;
  timeZone: string;
  buckets: DefiEarningsBucket[];
  totalEarned: number;
  firstSampleAt: string | null;
  asOf: string;
}

/** The server has no earnings route yet (404): the screen says so instead of calling it a failure. */
export class EarningsUnavailableError extends Error {
  constructor() {
    super('earnings endpoint not available');
    this.name = 'EarningsUnavailableError';
  }
}

/**
 * What the flexible (DeFi) savings earned, per calendar bucket in the user's
 * time zone, measured by the server from its balance readings. Fresh for five
 * minutes: a new reading lands at most that often, and the figures move slowly.
 */
export const useDefiEarnings = (period: EarningsPeriod) => {
  const { network, walletAddress } = useConfigStore();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return useQuery<DefiEarningsDTO>({
    queryKey: ['defi-earnings', network?.networkName, walletAddress, period, timeZone],
    queryFn: async () => {
      const params = new URLSearchParams({ period, count: String(EARNINGS_BARS[period]), tz: timeZone });
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/earnings/network/${network?.networkName}/wallet/${walletAddress}?${params}`,
      );
      if (response.status === 404) throw new EarningsUnavailableError();
      if (!response.ok) throw new Error(`earnings ${response.status}`);
      const body = (await response.json()) as { data?: DefiEarningsDTO };
      if (!body.data) throw new Error('earnings: empty');
      return body.data;
    },
    enabled: !!network?.networkName && !!walletAddress,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnMount: true,
    retry: (count, error) => !(error instanceof EarningsUnavailableError) && count < 1,
  });
};
