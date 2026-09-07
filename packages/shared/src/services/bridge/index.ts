import { prisma } from '@vaquita/db';
import type { BridgeTransfer } from '@vaquita/db';
import {
  assetsForDirection,
  getStatus,
  isTerminalStatus,
  requestQuote,
  type BridgeDirection,
  type OneClickConfig,
  type OneClickQuoteResponse,
  type OneClickStatus,
} from '../oneclick';

/**
 * Bridge transfers, as this app records them.
 *
 * The row is a receipt, not a state machine: 1Click owns the truth about where
 * a swap is, and `refreshTransfer` pulls it in when someone reads. That is what
 * replaced the old worker — with 1Click settling in 30-50 seconds, polling on
 * read covers the live case and refreshing the list covers anything that
 * finished while the app was closed.
 *
 * SECURITY: a transfer is only ever addressed by (id, wallet). The wallet comes
 * from the session, never from the URL — otherwise any id would expose someone
 * else's deposit address and amounts.
 */

export type BridgeTransferDTO = {
  id: string;
  direction: BridgeDirection;
  sourceNetwork: string;
  destinationNetwork: string;
  sourceWallet: string;
  destinationWallet: string;
  /** Human units, as the user entered them. */
  amount: string;
  amountRaw: string;
  /** Base units of the destination asset, as quoted. */
  amountOut: string | null;
  status: string;
  depositAddress: string | null;
  depositMemo: string | null;
  deadline: number | null;
  sourceTxHash: string | null;
  destinationTxHash: string | null;
  errorReason: string | null;
  createdTimestamp: number;
  updatedTimestamp: number;
};

export const toBridgeTransferDTO = (row: BridgeTransfer): BridgeTransferDTO => ({
  id: row.id,
  direction: row.direction as BridgeDirection,
  sourceNetwork: row.sourceNetwork,
  destinationNetwork: row.destinationNetwork,
  sourceWallet: row.sourceWallet,
  destinationWallet: row.destinationWallet,
  amount: row.amount,
  amountRaw: row.amountRaw,
  amountOut: row.amountOut,
  status: row.status,
  depositAddress: row.depositAddress,
  depositMemo: row.depositMemo,
  deadline: row.deadline ? row.deadline.getTime() : null,
  sourceTxHash: row.sourceTxHash,
  destinationTxHash: row.destinationTxHash,
  errorReason: row.errorReason,
  createdTimestamp: row.createdAt.getTime(),
  updatedTimestamp: row.updatedAt.getTime(),
});

/**
 * The wallet that owns a transfer is whichever end of it is this user's: the
 * source for an outbound Stellar payment, the destination for an inbound one
 * (where the source is an EVM address we never authenticated).
 */
const ownedBy = (wallet: string) => ({
  deletedAt: null,
  OR: [{ sourceWallet: wallet }, { destinationWallet: wallet }],
});

export const listBridgeTransfers = async (wallet: string, limit = 20): Promise<BridgeTransfer[]> =>
  prisma.bridgeTransfer.findMany({
    where: ownedBy(wallet),
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

export const getBridgeTransfer = async (id: string, wallet: string): Promise<BridgeTransfer | null> =>
  prisma.bridgeTransfer.findFirst({ where: { id, ...ownedBy(wallet) } });

type CreateParams = {
  direction: BridgeDirection;
  /** The user's Stellar address — their end of the transfer, whichever way it goes. */
  stellarWallet: string;
  /** The user's Base address — where funds go out to, or come back to on refund. */
  evmWallet: string;
  /** Human units, as typed. */
  amount: string;
  amountRaw: string;
  quote: OneClickQuoteResponse;
};

export const createBridgeTransfer = async (params: CreateParams): Promise<BridgeTransfer> => {
  const { origin, destination } = assetsForDirection(params.direction);
  const inbound = params.direction === 'evm_to_stellar';
  const { quote } = params.quote;

  return prisma.bridgeTransfer.create({
    data: {
      direction: params.direction,
      sourceNetwork: origin.chain,
      destinationNetwork: destination.chain,
      sourceWallet: inbound ? params.evmWallet : params.stellarWallet,
      destinationWallet: inbound ? params.stellarWallet : params.evmWallet,
      amount: params.amount,
      amountRaw: params.amountRaw,
      amountOut: quote.amountOut ?? null,
      status: 'PENDING_DEPOSIT',
      depositAddress: quote.depositAddress ?? null,
      depositMemo: quote.depositMemo ?? null,
      correlationId: params.quote.correlationId ?? null,
      deadline: quote.deadline ? new Date(quote.deadline) : null,
      // The signed response in full. It is the only evidence we hold if the
      // swap does not settle at the quoted rate.
      quote: params.quote as unknown as object,
    },
  });
};

/**
 * Re-reads one transfer's status from 1Click and persists any change.
 *
 * Terminal rows and rows without a deposit address are returned untouched —
 * there is nothing to ask about, and asking anyway would spend a request per
 * item on every list read.
 */
export const refreshTransfer = async (
  config: OneClickConfig,
  row: BridgeTransfer,
): Promise<BridgeTransfer> => {
  if (!row.depositAddress || isTerminalStatus(row.status)) return row;

  const result = await getStatus(config, row.depositAddress, row.depositMemo);
  // A failed status read is not a failed transfer. Leaving the row alone keeps
  // it pollable; writing FAILED here would strand funds that are still moving.
  if (!result.ok) return row;

  const { status, swapDetails } = result.data;
  const originHash = swapDetails?.originChainTxHashes?.[0]?.hash ?? null;
  const destinationHash = swapDetails?.destinationChainTxHashes?.[0]?.hash ?? null;

  const changed =
    status !== row.status ||
    (originHash && originHash !== row.sourceTxHash) ||
    (destinationHash && destinationHash !== row.destinationTxHash);
  if (!changed) return row;

  return prisma.bridgeTransfer.update({
    where: { id: row.id },
    data: {
      status,
      // `sourceTxHash` is uniquely indexed; only ever widen from null so a
      // duplicate hash from a retried read cannot collide.
      ...(originHash && !row.sourceTxHash ? { sourceTxHash: originHash } : {}),
      ...(destinationHash ? { destinationTxHash: destinationHash } : {}),
      ...(status === 'REFUNDED' && !row.errorReason
        ? { errorReason: 'refunded by the bridge' }
        : {}),
    },
  });
};

/** Refreshes every non-terminal row in a list, sequentially. */
export const refreshTransfers = async (
  config: OneClickConfig,
  rows: BridgeTransfer[],
): Promise<BridgeTransfer[]> => {
  const out: BridgeTransfer[] = [];
  for (const row of rows) out.push(await refreshTransfer(config, row));
  return out;
};

/** Records the tx the user sent to fund a deposit address (outbound leg). */
export const attachSourceTxHash = async (id: string, txHash: string): Promise<BridgeTransfer> =>
  prisma.bridgeTransfer.update({ where: { id }, data: { sourceTxHash: txHash } });

export type { BridgeDirection, OneClickStatus };
export { requestQuote };
