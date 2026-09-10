import { z } from 'zod';

import { VAULT_FLOW_KINDS } from '../services/vaultFlows/vaultFlows';

/**
 * What a client may report about a vault transaction the chain already accepted.
 *
 * The wallet is not in here: it comes from the session, so the body has nothing
 * to falsify. `flowKind` is required rather than defaulted — a caller that does
 * not know whether it moved money in from outside or sideways from a locked
 * position cannot be allowed to guess, because that choice decides whether the
 * deposit pays coins.
 */
export const vaultFlowSchema = z.object({
  flowKind: z.enum(VAULT_FLOW_KINDS as [string, ...string[]]),
  // Positive, matching the CHECK on the column. A zero-amount flow is a bug in
  // the caller, not a movement worth a row.
  amount: z.number().positive().finite(),
  transactionHash: z.string().min(1).max(100),
  // Optional: there is one supported USDC token today, and the server resolves
  // it. The field exists so a second vault token does not need a new endpoint.
  tokenSymbol: z.string().min(1).optional(),
});

export type VaultFlowPayload = z.infer<typeof vaultFlowSchema>;
