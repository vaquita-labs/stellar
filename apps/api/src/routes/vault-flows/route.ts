import { Router } from 'express';
import {
  getTokenBySymbol,
  grantDepositCoinsForWallet,
  isExternalVaultDeposit,
  prismaVaultFlowRepository,
  recordVaultFlow,
  sendError,
  sendSuccess,
  vaultFlowSchema,
  type VaultFlowKind,
} from '@vaquita/shared';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';
import { refreshWalletBalanceAfterEvent } from '../../lib/walletBalanceRefresh';

/**
 * The ledger of flexible-vault movements (`/vault-flows`).
 *
 * A flexible deposit is a direct user → vault call: the server never sees it,
 * and until this endpoint existed nothing recorded that it happened. The client
 * reports it here after the wallet returns a hash, which is the same shape the
 * ramp modals already use — transaction first, bookkeeping after.
 *
 * Three things this deliberately does NOT do:
 *
 * - **It does not copy `/deposit`.** Those routes carry no auth middleware at
 *   all and trust the `walletAddress` in the body. Here the wallet comes from
 *   the session and `requireSessionWallet` rejects an unauthenticated call even
 *   when `WALLET_AUTH_ENFORCE=false` — that flag only relaxes routes whose
 *   subject is already named in the URL, and this one has no such param.
 * - **It does not verify the hash on chain.** The hash came back from a
 *   successful Pollar submission; re-reading it would cost a Soroban call per
 *   deposit to confirm what the wallet already reported.
 * - **It does not trust the client's word twice.** The unique index on
 *   `transaction_hash` makes a retry idempotent, and `inserted` tells the
 *   handler whether this was a real write — which is what a coin grant has to
 *   gate on.
 */
const router = Router();

const DEFAULT_TOKEN_SYMBOL = 'USDC';

router.post('/', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);

  const parsed = vaultFlowSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    req.log.warn({ walletAddress, issues: parsed.error.issues }, 'POST /vault-flows rejected');
    return sendError(res, 'Invalid vault flow', parsed.error.issues, 400);
  }
  const { flowKind, amount, transactionHash, tokenSymbol } = parsed.data;
  req.log.info({ walletAddress, flowKind, amount, transactionHash }, 'POST /vault-flows');

  try {
    // `getTokenBySymbol` keeps only the supported row: production carries a
    // retired USDC token pointing at the same vault, and a flow filed against it
    // would be invisible to every read, which all filter to supported tokens.
    const { data: token, error: tokenError } = await getTokenBySymbol(tokenSymbol ?? DEFAULT_TOKEN_SYMBOL);
    if (tokenError) throw tokenError;
    if (!token) return sendError(res, `Token not found "${tokenSymbol ?? DEFAULT_TOKEN_SYMBOL}"`, null, 400);

    const { data, error } = await recordVaultFlow(prismaVaultFlowRepository, {
      walletAddress,
      tokenId: token.id,
      flowKind: flowKind as VaultFlowKind,
      amount,
      transactionHash,
    });
    if (error || !data) {
      req.log.error({ err: error, walletAddress, transactionHash }, 'Failed to record vault flow');
      return sendError(res, 'Failed to record vault flow', error, 500);
    }

    // Detached, like the deposit confirm handler. It matters more here than it
    // looks: the vault XP accumulator only ticks when a wallet's balances are
    // read, and a flexible saver has no other event that triggers one.
    refreshWalletBalanceAfterEvent(walletAddress, req.log, 'vault-flow');

    // Only a first write of an external inflow pays: a retry of the same hash
    // lands here with `inserted: false`, and an internal move is the user's own
    // money shifting between products, not new savings. Detached, like the
    // balance refresh — a coin the ledger refused must not fail a recording the
    // chain already justified.
    if (data.inserted && isExternalVaultDeposit(data.flow.flowKind)) {
      void grantDepositCoinsForWallet(walletAddress, amount)
        .then((coins) => {
          if (coins > 0) req.log.info({ walletAddress, transactionHash, coins }, 'Deposit coins granted');
        })
        .catch((err) => req.log.warn({ err, walletAddress, transactionHash }, 'Failed to grant deposit coins'));
    }

    return sendSuccess(res, { id: data.flow.id, inserted: data.inserted }, 'vault flow recorded');
  } catch (err) {
    req.log.error({ err, walletAddress, transactionHash }, 'Failed to record vault flow');
    return sendError(res, 'Failed to record vault flow', err, 500);
  }
});

export default router;
