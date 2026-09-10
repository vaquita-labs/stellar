/**
 * The server's ledger of money entering and leaving the flexible vault.
 *
 * A locked deposit writes a `deposits` row on every transaction; a flexible
 * deposit is a direct user → vault call that, until this module existed, wrote
 * nothing at all. Every metric that asks *who did what, when* was therefore
 * blind to the product the deposit sheet offers first, and a vault-only saver
 * could never unlock a deposit badge no matter how much they held.
 *
 * Two shapes here differ deliberately from `deposits`:
 *
 * - **No `initiated` → `confirmed` handshake.** `deposits` needs one because a
 *   locked deposit carries a caller-chosen `deposit_id` to match against chain
 *   state. The vault has no such id: the wallet either returns a hash or it does
 *   not, so a row is written once, already confirmed.
 * - **`transaction_hash` is unique.** `deposits` has no such constraint, which
 *   is what lets the reconciler re-confirm a row. Here the hash is the whole
 *   idempotency story, and it is also what stops a retried POST from paying
 *   coins twice — hence {@link RecordVaultFlowResult.inserted}.
 *
 * Everything is defined against {@link VaultFlowRepository} rather than Prisma,
 * so the service is tested end to end with an in-memory fake.
 */

/** Which way the USDC moved, from the vault's point of view. */
export type VaultFlowDirection = 'deposit' | 'withdraw';

/**
 * Whether the money crossed Vaquita's boundary or only moved between its own
 * two products.
 *
 * Four of the nine client call sites are internal: `InvestModal` moves flexible
 * → locked, `PositionWithdrawSheet` moves locked → flexible, and the two legacy
 * Blend migration calls move an old position into the vault. Counted naively,
 * `InvestModal` produces a vault outflow *and* a locked inflow, so total volume
 * would rise by twice an amount the user never added.
 *
 * This column is load-bearing beyond metrics: it gates the coin grant and the
 * badge count, so mislabelling one pays a user for shuffling their own money
 * sideways.
 */
export type VaultFlowKind = 'external_in' | 'external_out' | 'internal_in' | 'internal_out';

export const VAULT_FLOW_KINDS: VaultFlowKind[] = ['external_in', 'external_out', 'internal_in', 'internal_out'];

/**
 * `direction` is derivable from `flow_kind`, and a CHECK in the database says so.
 * It exists as its own column because every reader wants "deposits" without
 * having to know the four kinds, and deriving it here means the two can never
 * disagree — nothing outside this function is allowed to set it.
 */
export function directionForFlowKind(flowKind: VaultFlowKind): VaultFlowDirection {
  return flowKind.endsWith('_in') ? 'deposit' : 'withdraw';
}

/** Money the user actually added, as opposed to money they moved sideways. */
export function isExternalVaultDeposit(flowKind: VaultFlowKind): boolean {
  return flowKind === 'external_in';
}

export interface VaultFlowRecord {
  id: string;
  walletAddress: string;
  tokenId: number;
  direction: VaultFlowDirection;
  flowKind: VaultFlowKind;
  /** Human units (USDC), like `deposits.amount`. */
  amount: number;
  transactionHash: string;
  confirmedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface VaultFlowRepository {
  create(
    input: Omit<VaultFlowRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<VaultFlowRecord>;
  findByTransactionHash(transactionHash: string): Promise<VaultFlowRecord | null>;
  /** Lifetime count of a wallet's flows of one kind. Feeds the badge signals. */
  countByWalletAndKind(walletAddress: string, flowKind: VaultFlowKind): Promise<number>;
}

export interface RecordVaultFlowInput {
  /** Always the session's: the body never names a wallet. */
  walletAddress: string;
  tokenId: number;
  flowKind: VaultFlowKind;
  amount: number;
  transactionHash: string;
  /** Defaults to now — the client reports a transaction the chain just accepted. */
  confirmedAt?: Date;
}

export interface RecordVaultFlowResult {
  flow: VaultFlowRecord;
  /**
   * False when the hash was already on file.
   *
   * The caller still answers the client with success — the transaction did
   * happen, and a retry must look like it worked — but only a real insert may
   * grant coins. This flag is the only thing standing between a flaky network
   * and a wallet that farms the daily cap by resending one POST.
   */
  inserted: boolean;
}

type ServiceResult<T> = { data: T; error: Error | null };

/**
 * Write one flow, or recognise the one already written.
 *
 * The hash is checked before inserting and again after a failed insert: the
 * first read is the common case (a client retrying its own POST), the second
 * covers two requests racing into the unique index, where the loser must return
 * the winner's row rather than an error the client would retry forever.
 */
export async function recordVaultFlow(
  repository: VaultFlowRepository,
  input: RecordVaultFlowInput,
): Promise<ServiceResult<RecordVaultFlowResult | null>> {
  try {
    const existing = await repository.findByTransactionHash(input.transactionHash);
    if (existing) return { data: { flow: existing, inserted: false }, error: null };

    try {
      const flow = await repository.create({
        walletAddress: input.walletAddress,
        tokenId: input.tokenId,
        direction: directionForFlowKind(input.flowKind),
        flowKind: input.flowKind,
        amount: input.amount,
        transactionHash: input.transactionHash,
        confirmedAt: input.confirmedAt ?? new Date(),
      });
      return { data: { flow, inserted: true }, error: null };
    } catch (error) {
      const raced = await repository.findByTransactionHash(input.transactionHash);
      if (!raced) throw error;
      return { data: { flow: raced, inserted: false }, error: null };
    }
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * How many deposits this wallet has made into the vault, ever.
 *
 * Lifetime and not balance-gated, on purpose: vault shares are fungible, so no
 * withdrawal can be traced back to a particular deposit and any "still active"
 * rule would have to invent an attribution that does not exist. Badge unlocks
 * are latched anyway, so a balance-gated count would not have taken a badge
 * back either — it would only have made the number harder to explain.
 */
export async function countExternalVaultDeposits(
  repository: VaultFlowRepository,
  walletAddress: string,
): Promise<ServiceResult<number>> {
  try {
    return { data: await repository.countByWalletAndKind(walletAddress, 'external_in'), error: null };
  } catch (error) {
    return { data: 0, error: error as Error };
  }
}
