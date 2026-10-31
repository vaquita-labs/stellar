'use client';

import type { TxHistoryRecord } from '@pollar/core';
import { usePollar } from '@pollar/react';
import { useQuery } from '@tanstack/react-query';
import { useConfigStore } from '../stores';

export type ActivityKind = 'sent' | 'received' | 'flexibleIn' | 'flexibleOut' | 'lockedIn' | 'lockedOut' | 'badge' | 'other';

/** One movement of the wallet, in the user's terms, ready for a list row. */
export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** The operation's own words when nothing better is known. */
  summary: string;
  /** Amount and asset when the record carries them. */
  amount: number | null;
  asset: string | null;
  /** The other address of a payment, shortened; null for anything else. */
  counterparty: string | null;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  timestamp: number;
  hash: string;
}

const asString = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const asNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * What a history record means for this wallet. The SDK describes the
 * operation (payment, contract call, ...) and leaves the particulars in
 * `details`; the vault and the savings contract are told apart by their
 * contract ids from the app's config.
 */
export function describeRecord(
  record: TxHistoryRecord,
  walletAddress: string,
  contracts: { vault: string | null; locks: string | null },
): ActivityItem {
  const details = record.details ?? {};
  const amount = asNumber(details.amount) ?? asNumber(details.value);
  const asset = asString(details.assetCode) ?? asString(details.asset) ?? asString(details.symbol);
  const method = asString(details.method);
  const contractId = asString(details.contractId) ?? asString(details.contract);
  const from = asString(details.from) ?? asString(details.source);
  const to = asString(details.to) ?? asString(details.destination);

  let kind: ActivityKind = 'other';
  let counterparty: string | null = null;
  if (record.operation === 'payment' || record.operation === 'transfer' || record.operation === 'path_payment_strict_send') {
    const received = !!to && to === walletAddress && from !== walletAddress;
    kind = received ? 'received' : 'sent';
    const other = received ? from : to;
    counterparty = other ? `${other.slice(0, 4)}…${other.slice(-4)}` : null;
  } else if (record.operation === 'invoke_contract' && method) {
    const flexible = !!contracts.vault && contractId === contracts.vault;
    const locked = !!contracts.locks && contractId === contracts.locks;
    if (method === 'deposit' && flexible) kind = 'flexibleIn';
    else if (method === 'withdraw' && flexible) kind = 'flexibleOut';
    else if (method === 'deposit' && locked) kind = 'lockedIn';
    else if (method === 'withdraw' && locked) kind = 'lockedOut';
    else if (method === 'mint_badge') kind = 'badge';
  }
  return {
    id: record.id,
    kind,
    summary: record.summary,
    amount,
    asset: asset ?? (amount !== null ? 'USDC' : null),
    counterparty,
    status: record.status,
    timestamp: Date.parse(record.createdAt),
    hash: record.hash,
  };
}

/**
 * The wallet's latest movements on chain, as the SDK keeps them: payments
 * sent and received, money into and out of the savings, badges. Read through
 * the SDK's history store; three is what the home shows.
 */
export function useRecentActivity(limit = 3) {
  const { getClient, isAuthenticated } = usePollar();
  const { walletAddress, token } = useConfigStore();
  const contracts = {
    vault: token?.defindexVaultContractAddress ?? null,
    locks: token?.vaquitaContractAddress ?? null,
  };
  return useQuery<ActivityItem[]>({
    queryKey: ['recent-activity', walletAddress, limit],
    enabled: Boolean(walletAddress) && isAuthenticated,
    staleTime: 60_000,
    refetchOnMount: true,
    retry: 1,
    queryFn: async () => {
      const client = getClient();
      await client.fetchTxHistory({ limit, chain: 'STELLAR' });
      const state = client.getTxHistoryState();
      if (state.step !== 'loaded') throw new Error('history not loaded');
      return state.data.records.map((record) => describeRecord(record, walletAddress!, contracts));
    },
  });
}
