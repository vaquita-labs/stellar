import { z } from 'zod';

/**
 * What a client may report about a payment the chain already accepted.
 *
 * Two fields are deliberately absent. The **sender** comes from the session, so
 * the body has nothing to falsify. The **destination kind** is resolved
 * server-side against `profiles`: it decides whether the row counts as money
 * changing hands inside the app or money leaving it, and a client that reported
 * it could move volume between those two totals at will.
 */
export const walletTransferSchema = z.object({
  // Positive, matching the CHECK on the column. A zero-amount payment is a bug
  // in the caller, not a movement worth a row.
  amount: z.number().positive().finite(),
  // The resolved G… address. An @username is resolved before the payment is
  // signed, so a handle never arrives here.
  destinationAddress: z.string().min(1).max(100),
  transactionHash: z.string().min(1).max(100),
  // Optional: there is one supported USDC token today, and the server resolves
  // it. The field exists so a second token does not need a new endpoint.
  tokenSymbol: z.string().min(1).optional(),
});

export type WalletTransferPayload = z.infer<typeof walletTransferSchema>;
