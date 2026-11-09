'use client';

import type { PollarClient, TxHistoryContent } from '@pollar/core';
import { usePollar } from '@pollar/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WITHDRAW_SLIPPAGE_BPS } from '@/networks/stellar/vaultQueries';
import { type ActivityContext, type ActivityItem, describeRecords } from '../helpers/activity';
import { useConfigStore } from '../stores';

export type { ActivityItem, ActivityKind } from '../helpers/activity';

/** Records asked for per request. */
const PAGE_SIZE = 50;
/** Upper bound on what one read walks through: 1,000 records. */
const MAX_PAGES = 20;

/**
 * One page of the wallet's history. The SDK keeps a single history store:
 * `fetchTxHistory` writes into it and whichever call lands last wins, so two
 * reads at once would hand each other's page back. Every read goes through
 * this queue, and checks the page it finds is the one it asked for.
 */
let queue: Promise<unknown> = Promise.resolve();
function readHistoryPage(client: PollarClient, offset: number): Promise<TxHistoryContent> {
  const read = async () => {
    await client.fetchTxHistory({ limit: PAGE_SIZE, offset, chain: 'STELLAR' });
    const state = client.getTxHistoryState();
    if (state.step !== 'loaded' || state.params.offset !== offset || state.params.limit !== PAGE_SIZE) {
      throw new Error('history not loaded');
    }
    return state.data;
  };
  const page = queue.then(read, read);
  queue = page.catch(() => undefined);
  return page;
}

/**
 * The wallet's movements, newest first, read page by page until `enough`
 * says there are plenty or the history runs out.
 */
async function readActivity(
  client: PollarClient,
  walletAddress: string,
  context: ActivityContext,
  enough: (items: ActivityItem[]) => boolean,
): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const content = await readHistoryPage(client, offset);
    items.push(...describeRecords(content.records, walletAddress, context));
    if (enough(items) || content.records.length === 0 || offset + content.records.length >= content.total) break;
  }
  return items;
}

const activityKey = (walletAddress: string | null | undefined, scope: 'recent' | 'all') =>
  ['wallet-activity', walletAddress, scope] as const;

function useActivitySource() {
  const { getClient, isAuthenticated } = usePollar();
  const { walletAddress, token } = useConfigStore();
  const context: ActivityContext | null = token
    ? {
        vault: token.defindexVaultContractAddress ?? null,
        locks: token.vaquitaContractAddress ?? null,
        token: token.contractAddress ?? null,
        symbol: token.symbol,
        decimals: token.decimals,
        withdrawSlippageBps: WITHDRAW_SLIPPAGE_BPS,
      }
    : null;
  return {
    walletAddress,
    // Without the token the contracts cannot be told apart: wait for it.
    enabled: Boolean(walletAddress) && isAuthenticated && context !== null,
    read: (enough: (items: ActivityItem[]) => boolean) => readActivity(getClient(), walletAddress!, context!, enough),
  };
}

/**
 * The wallet's latest movements on chain, as the SDK keeps them: payments,
 * money into and out of the savings, badges. Three is what the home shows.
 * Sign-ins are left out, so it reads on until it has `limit` real movements.
 */
export function useRecentActivity(limit = 3) {
  const { walletAddress, enabled, read } = useActivitySource();
  return useQuery<ActivityItem[]>({
    queryKey: activityKey(walletAddress, 'recent'),
    enabled,
    staleTime: 60_000,
    refetchOnMount: true,
    retry: 1,
    queryFn: () => read((items) => items.length >= limit),
    select: (items) => items.slice(0, limit),
  });
}

/**
 * Every movement in the wallet's history, for the Transactions screen and a
 * movement's own page. Opens on what the home already read while the rest
 * loads, so a movement tapped there is on screen at once.
 */
export function useWalletActivity() {
  const { walletAddress, enabled, read } = useActivitySource();
  const queryClient = useQueryClient();
  return useQuery<ActivityItem[]>({
    queryKey: activityKey(walletAddress, 'all'),
    enabled,
    staleTime: 60_000,
    refetchOnMount: true,
    retry: 1,
    queryFn: () => read(() => false),
    placeholderData: () => queryClient.getQueryData<ActivityItem[]>(activityKey(walletAddress, 'recent')),
  });
}
