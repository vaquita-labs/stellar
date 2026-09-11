import { Router } from 'express';
import {
  getTokenBySymbol,
  isSelfTransfer,
  prismaWalletTransferRepository,
  recordWalletTransfer,
  sendError,
  sendSuccess,
  walletTransferSchema,
} from '@vaquita/shared';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';
import { refreshWalletBalanceAfterEvent } from '../../lib/walletBalanceRefresh';

/**
 * The ledger of payments out of a user's wallet (`/wallet-transfers`).
 *
 * The send sheet signs a sponsored USDC payment and, until this endpoint
 * existed, told the server nothing about it. That one path is both the
 * peer-to-peer feature and the way money leaves to an outside address, so the
 * two volumes the product talks about most were the two nothing recorded.
 *
 * Deliberately a near-copy of `/vault-flows`: same class of record, so the same
 * four rules apply.
 *
 * - **The wallet comes from the session**, and `requireSessionWallet` rejects an
 *   unauthenticated call even when `WALLET_AUTH_ENFORCE=false` — that flag only
 *   relaxes routes whose subject is already named in the URL, and this one has no
 *   such param.
 * - **The hash is not verified on chain.** It came back from a successful Pollar
 *   submission; re-reading it would cost a Soroban call per payment to confirm
 *   what the wallet already reported.
 * - **The destination kind is resolved here, not accepted from the body.** It
 *   decides which total the row counts against, so a client could otherwise move
 *   volume between "changed hands inside the app" and "left the app".
 * - **No coins.** Sending money is not saving. The deposit grant on `/vault-flows`
 *   is gated on an external vault *deposit* for exactly that reason.
 */
const router = Router();

const DEFAULT_TOKEN_SYMBOL = 'USDC';

router.post('/', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);

  const parsed = walletTransferSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    req.log.warn({ walletAddress, issues: parsed.error.issues }, 'POST /wallet-transfers rejected');
    return sendError(res, 'Invalid wallet transfer', parsed.error.issues, 400);
  }
  const { amount, destinationAddress, transactionHash, tokenSymbol } = parsed.data;

  // Refused with a 4xx, which the reporting client never retries. A self-send is
  // not volume, and letting the database CHECK catch it would surface as a 500
  // the client would retry forever.
  if (isSelfTransfer(walletAddress, destinationAddress)) {
    req.log.warn({ walletAddress, transactionHash }, 'POST /wallet-transfers refused a self-send');
    return sendError(res, 'A transfer cannot be sent to the sender', null, 400);
  }

  req.log.info({ walletAddress, destinationAddress, amount, transactionHash }, 'POST /wallet-transfers');

  try {
    // `getTokenBySymbol` keeps only the supported row: production carries a
    // retired USDC token, and a transfer filed against it would be invisible to
    // every read, which all filter to supported tokens.
    const { data: token, error: tokenError } = await getTokenBySymbol(tokenSymbol ?? DEFAULT_TOKEN_SYMBOL);
    if (tokenError) throw tokenError;
    if (!token) return sendError(res, `Token not found "${tokenSymbol ?? DEFAULT_TOKEN_SYMBOL}"`, null, 400);

    const { data, error } = await recordWalletTransfer(prismaWalletTransferRepository, {
      walletAddress,
      tokenId: token.id,
      amount,
      destinationAddress,
      transactionHash,
    });
    if (error || !data) {
      req.log.error({ err: error, walletAddress, transactionHash }, 'Failed to record wallet transfer');
      return sendError(res, 'Failed to record wallet transfer', error, 500);
    }

    // Detached, like the vault-flow handler. The payment moved USDC out of the
    // sender's wallet, so the snapshot every balance read serves is now stale.
    refreshWalletBalanceAfterEvent(walletAddress, req.log, 'wallet-transfer');

    return sendSuccess(res, { id: data.transfer.id, inserted: data.inserted }, 'wallet transfer recorded');
  } catch (err) {
    req.log.error({ err, walletAddress, transactionHash }, 'Failed to record wallet transfer');
    return sendError(res, 'Failed to record wallet transfer', err, 500);
  }
});

export default router;
