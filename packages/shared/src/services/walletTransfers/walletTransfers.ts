/**
 * The server's ledger of USDC leaving a wallet by payment.
 *
 * Three products already record money moving: `deposits` for locked savings,
 * `vault_flows` for the flexible vault, `offramp_withdrawals` for a bank payout.
 * A plain payment out of the wallet recorded nothing — and that single code path
 * is both features the send sheet offers, paying another Vaquita user by
 * @username and sending to any Stellar address. So peer-to-peer volume and
 * money-leaving-the-app volume, the two figures the product talks about most,
 * were the two nothing could answer.
 *
 * It is also the missing half of a withdrawal. Hop 1 of the withdraw sheet
 * writes a vault `external_out`; hop 2 pays it onward and wrote nothing, so a
 * withdrawal to an outside address looked like it stopped in the wallet.
 *
 * Shaped after {@link recordVaultFlow} deliberately — same class of record, one
 * day younger — so there is one reporting pattern to understand rather than two:
 * no initiated → confirmed handshake, a unique `transaction_hash` carrying the
 * whole idempotency story, and everything defined against
 * {@link WalletTransferRepository} so it is tested with an in-memory fake.
 */

/**
 * Whether the money changed hands inside Vaquita or left it.
 *
 * This is the whole reason the table can be summed. A payment to another Vaquita
 * user moves ownership while the dollars stay in the app; a payment to an outside
 * address is money gone. Those belong to two different totals, and nothing else
 * in the row distinguishes them — both are the same call to the same contract.
 */
export type WalletTransferDestinationKind = 'vaquita_user' | 'external';

export const WALLET_TRANSFER_DESTINATION_KINDS: WalletTransferDestinationKind[] = ['vaquita_user', 'external'];

/**
 * Paying yourself is not volume: nothing changed hands and nothing left.
 *
 * The send sheet already blocks it during validation, so this is not the first
 * line of defence — but the table is what the dashboard sums, and a self-send
 * that reached it would inflate every total it touched. Checked here so the route
 * can refuse with a 4xx (which the reporting client never retries) instead of
 * letting the database CHECK surface as a 500 the client would retry forever.
 */
export function isSelfTransfer(walletAddress: string, destinationAddress: string): boolean {
  return walletAddress === destinationAddress;
}

export interface WalletTransferRecord {
  id: string;
  walletAddress: string;
  tokenId: number;
  /** Human units (USDC), like `deposits.amount`. */
  amount: number;
  destinationAddress: string;
  destinationKind: WalletTransferDestinationKind;
  destinationProfileId: number | null;
  transactionHash: string;
  confirmedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTransferRepository {
  create(input: Omit<WalletTransferRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<WalletTransferRecord>;
  findByTransactionHash(transactionHash: string): Promise<WalletTransferRecord | null>;
  /**
   * The profile that owns an address right now, or null. Called once, at insert,
   * and the answer is then frozen into the row — see
   * {@link RecordWalletTransferInput}.
   */
  findProfileIdByWalletAddress(walletAddress: string): Promise<number | null>;
}

export interface RecordWalletTransferInput {
  /** Always the session's: the body never names a sender. */
  walletAddress: string;
  tokenId: number;
  amount: number;
  /**
   * The resolved G… address. An @username is resolved before the payment is
   * signed, so a handle never reaches here: handles are renameable, addresses are
   * not.
   *
   * The destination *kind* is not an input. It is resolved server-side against
   * `profiles`, because it decides which total the row counts against and a
   * client that misreports it moves money between two figures. It is then stored
   * rather than re-derived on read: "was this a payment to a Vaquita user" has to
   * mean *at the time it happened*, and profiles are deleted, wallets rotate, and
   * an address nobody owns today may belong to someone next week.
   */
  destinationAddress: string;
  transactionHash: string;
  /** Defaults to now — the client reports a transaction the chain just accepted. */
  confirmedAt?: Date;
}

export interface RecordWalletTransferResult {
  transfer: WalletTransferRecord;
  /**
   * False when the hash was already on file. The caller still answers success —
   * the payment did happen, and a retry must look like it worked.
   */
  inserted: boolean;
}

type ServiceResult<T> = { data: T; error: Error | null };

/**
 * Write one transfer, or recognise the one already written.
 *
 * The hash is checked before inserting and again after a failed insert: the
 * first read is the common case (a client retrying its own POST), the second
 * covers two requests racing into the unique index, where the loser must return
 * the winner's row rather than an error the client would retry forever.
 */
export async function recordWalletTransfer(
  repository: WalletTransferRepository,
  input: RecordWalletTransferInput,
): Promise<ServiceResult<RecordWalletTransferResult | null>> {
  try {
    const existing = await repository.findByTransactionHash(input.transactionHash);
    if (existing) return { data: { transfer: existing, inserted: false }, error: null };

    const destinationProfileId = await repository.findProfileIdByWalletAddress(input.destinationAddress);

    try {
      const transfer = await repository.create({
        walletAddress: input.walletAddress,
        tokenId: input.tokenId,
        amount: input.amount,
        destinationAddress: input.destinationAddress,
        // The pair has to agree: 'external' means no profile was found, so a
        // profile id alongside it would contradict the column every read splits
        // on. A CHECK in the database says the same thing.
        destinationKind: destinationProfileId === null ? 'external' : 'vaquita_user',
        destinationProfileId,
        transactionHash: input.transactionHash,
        confirmedAt: input.confirmedAt ?? new Date(),
      });
      return { data: { transfer, inserted: true }, error: null };
    } catch (error) {
      const raced = await repository.findByTransactionHash(input.transactionHash);
      if (!raced) throw error;
      return { data: { transfer: raced, inserted: false }, error: null };
    }
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
