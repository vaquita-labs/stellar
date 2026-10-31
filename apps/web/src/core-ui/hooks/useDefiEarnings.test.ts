/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  config: {
    network: { networkName: 'Stellar' } as { networkName: string } | null,
    walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' as string | null,
  },
  fetch: vi.fn(),
}));

vi.mock('@/core-ui/stores', () => ({
  useConfigStore: () => h.config,
}));

vi.mock('@/core-ui/config/clientEnv', () => ({
  clientEnv: { NEXT_PUBLIC_SERVICES_URL: 'https://services.test' },
}));

import { EARNINGS_BARS, useDefiEarnings } from './useDefiEarnings';

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient, children });

beforeEach(() => {
  vi.clearAllMocks();
  h.config.network = { networkName: 'Stellar' };
  h.config.walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  h.fetch.mockReset();
  vi.stubGlobal('fetch', h.fetch);
  // One client per test: a fresh client on every wrapper render would drop the query mid-flight.
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useDefiEarnings', () => {
  it('asks for the period bars and the browser time zone', async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    h.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          currency: 'USDC',
          period: 'daily',
          timeZone: tz,
          buckets: [],
          totalEarned: 0,
          firstSampleAt: null,
          asOf: '2026-10-28T19:00:00.000Z',
        },
      }),
    });

    const { result } = renderHook(() => useDefiEarnings('daily'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(h.fetch).toHaveBeenCalledTimes(1);
    const url = String(h.fetch.mock.calls[0]?.[0]);
    expect(url).toContain('https://services.test/api/v1/earnings/network/Stellar/wallet/');
    expect(url).toContain('period=daily');
    expect(url).toContain(`count=${EARNINGS_BARS.daily}`);
    expect(url).toContain(`tz=${encodeURIComponent(tz)}`);
    expect(result.current.data?.totalEarned).toBe(0);
  });

  it.each([
    ['monthly', EARNINGS_BARS.monthly],
    ['yearly', EARNINGS_BARS.yearly],
  ] as const)('uses %s bar count %s', async (period, count) => {
    h.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          currency: 'USDC',
          period,
          timeZone: 'UTC',
          buckets: [],
          totalEarned: 0,
          firstSampleAt: null,
          asOf: '2026-10-28T19:00:00.000Z',
        },
      }),
    });

    const { result } = renderHook(() => useDefiEarnings(period), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(h.fetch.mock.calls[0]?.[0])).toContain(`count=${count}`);
  });

  it('stays idle without a wallet or a network', () => {
    h.config.walletAddress = null;
    const { result: noWallet } = renderHook(() => useDefiEarnings('daily'), { wrapper });
    expect(noWallet.current.fetchStatus).toBe('idle');
    expect(h.fetch).not.toHaveBeenCalled();

    h.config.walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    h.config.network = null;
    const { result: noNetwork } = renderHook(() => useDefiEarnings('daily'), { wrapper });
    expect(noNetwork.current.fetchStatus).toBe('idle');
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('fails when the API answers with an error status', async () => {
    h.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useDefiEarnings('daily'), { wrapper });
    // The hook retries once (`retry: 1`); wait past that backoff.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5_000 });
    expect(String(result.current.error?.message)).toContain('earnings 500');
  });

  it('fails when the API body has no data', async () => {
    h.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useDefiEarnings('daily'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5_000 });
    expect(String(result.current.error?.message)).toContain('earnings: empty');
  });

  it('exposes the buckets the chart paints', async () => {
    h.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          currency: 'USDC',
          period: 'daily',
          timeZone: 'UTC',
          buckets: [{ start: '2026-10-27T00:00:00.000Z', end: '2026-10-28T00:00:00.000Z', earned: 0.82, estimated: false }],
          totalEarned: 0.82,
          firstSampleAt: '2026-10-20T00:00:00.000Z',
          asOf: '2026-10-28T19:00:00.000Z',
        },
      }),
    });

    const { result } = renderHook(() => useDefiEarnings('daily'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => undefined);
    expect(result.current.data?.buckets).toHaveLength(1);
    expect(result.current.data?.buckets[0]?.earned).toBe(0.82);
  });
});
