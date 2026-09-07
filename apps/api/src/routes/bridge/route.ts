import { Router } from 'express';
import { apiServicesEnv } from '@vaquita/shared/config/apiServicesEnv';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';
import {
  assetsForDirection,
  attachSourceTxHash,
  createBridgeTransfer,
  getBridgeTransfer,
  humanToBaseUnits,
  isBridgeDirection,
  isValidEvmAddress,
  isValidStellarAddress,
  listBridgeTransfers,
  refreshTransfer,
  refreshTransfers,
  requestQuote,
  sendError,
  sendSuccess,
  submitDepositTx,
  toBridgeTransferDTO,
  type BridgeDirection,
  type OneClickConfig,
} from '@vaquita/shared';

/**
 * Cross-chain USDC bridge (`/bridge`), settled by NEAR Intents 1Click.
 *
 * Every route is behind `requireSessionWallet`. The predecessor had none, which
 * meant any caller could enumerate transfers by wallet address and read other
 * people's deposit addresses and amounts.
 *
 * There is no worker and no webhook: 1Click's status is pulled here, when a
 * transfer is read. A swap settles in roughly 30-50 seconds, so the client's
 * poll covers the live case and refreshing on list covers anything that landed
 * while the app was closed.
 */
const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_HASH_RE = /^[0-9a-fA-F]{64}$/;
// Below this a swap is mostly fees; 1Click would quote it, but the user would
// be surprised by what arrives.
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100_000;

const oneClickConfig = (): OneClickConfig => ({
  baseUrl: apiServicesEnv.NEAR_1CLICK_BASE_URL,
  ...(apiServicesEnv.NEAR_1CLICK_JWT ? { jwt: apiServicesEnv.NEAR_1CLICK_JWT } : {}),
});

type QuoteInput = {
  direction: BridgeDirection;
  amount: string;
  amountRaw: string;
  /** The user's Stellar address, from the session. */
  stellarWallet: string;
  /** The counterparty address on Base, supplied by the user. */
  evmWallet: string;
};

/**
 * Validates a quote/transfer body.
 *
 * The Stellar side is NOT taken from the body: it is the session wallet, so a
 * caller cannot quote a transfer that pays out to someone else's account.
 */
function validate(body: unknown, stellarWallet: string): { ok: true; value: QuoteInput } | { ok: false; message: string } {
  const raw = (body ?? {}) as { direction?: unknown; amount?: unknown; evmWallet?: unknown };

  if (!isBridgeDirection(raw.direction)) return { ok: false, message: 'Unsupported bridge direction.' };
  const direction = raw.direction;

  const evmWallet = typeof raw.evmWallet === 'string' ? raw.evmWallet.trim() : '';
  if (!isValidEvmAddress(evmWallet)) return { ok: false, message: 'A valid Base address is required.' };

  if (!isValidStellarAddress(stellarWallet)) return { ok: false, message: 'The session wallet is not a valid Stellar address.' };

  const amount = typeof raw.amount === 'string' ? raw.amount.trim() : String(raw.amount ?? '');
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric < MIN_AMOUNT || numeric > MAX_AMOUNT) {
    return { ok: false, message: `Enter an amount between ${MIN_AMOUNT} and ${MAX_AMOUNT} USDC.` };
  }

  // Decimals differ per side (Base USDC 6, Stellar USDC 7), so the scale comes
  // from whichever asset the user is sending.
  const { origin } = assetsForDirection(direction);
  const amountRaw = humanToBaseUnits(amount, origin.decimals);
  if (!amountRaw || amountRaw === '0') return { ok: false, message: 'Enter a valid amount.' };

  return { ok: true, value: { direction, amount, amountRaw, stellarWallet, evmWallet } };
}

/** Who receives, and who gets a refund, for each direction. */
const routing = (input: QuoteInput) =>
  input.direction === 'evm_to_stellar'
    ? { recipient: input.stellarWallet, refundTo: input.evmWallet }
    : { recipient: input.evmWallet, refundTo: input.stellarWallet };

// ---------------------------------------------------------------------------
// POST /api/v1/bridge/quote — preview only, no deposit address is issued
// ---------------------------------------------------------------------------

router.post('/quote', requireSessionWallet, async (req, res) => {
  const wallet = getSessionWallet(res);
  const validation = validate(req.body, wallet);
  if (!validation.ok) return sendError(res, validation.message, null, 400);

  try {
    const result = await requestQuote(oneClickConfig(), {
      ...routing(validation.value),
      direction: validation.value.direction,
      amountRaw: validation.value.amountRaw,
      dry: true,
    });
    // 1Click's 4xx messages are the useful ones — a Stellar recipient without a
    // USDC trustline is rejected here, by name — so they reach the user.
    if (!result.ok) return sendError(res, result.reason, null, 400);

    const { quote } = result.data;
    return sendSuccess(res, {
      amountIn: quote.amountInFormatted,
      amountOut: quote.amountOutFormatted,
      minAmountOut: quote.minAmountOut ?? null,
      withdrawFee: quote.withdrawFee ?? null,
      timeEstimate: quote.timeEstimate ?? null,
      deadline: quote.deadline ?? null,
    });
  } catch (err) {
    req.log.error({ err }, 'Failed to quote bridge transfer');
    return sendError(res, 'Failed to quote bridge transfer', null, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/bridge/transfers — live quote + the row that tracks it
// ---------------------------------------------------------------------------

router.post('/transfers', requireSessionWallet, async (req, res) => {
  const wallet = getSessionWallet(res);
  const validation = validate(req.body, wallet);
  if (!validation.ok) return sendError(res, validation.message, null, 400);

  try {
    const result = await requestQuote(oneClickConfig(), {
      ...routing(validation.value),
      direction: validation.value.direction,
      amountRaw: validation.value.amountRaw,
      dry: false,
    });
    if (!result.ok) return sendError(res, result.reason, null, 400);

    // Without an address the user has nowhere to send funds, and a row would
    // only be a transfer that can never start.
    if (!result.data.quote.depositAddress) {
      return sendError(res, 'The bridge did not return a deposit address.', null, 502);
    }

    const row = await createBridgeTransfer({
      direction: validation.value.direction,
      stellarWallet: validation.value.stellarWallet,
      evmWallet: validation.value.evmWallet,
      amount: validation.value.amount,
      amountRaw: validation.value.amountRaw,
      quote: result.data,
    });

    req.log.info(
      { bridgeTransferId: row.id, direction: row.direction, amount: row.amount },
      'Bridge transfer created',
    );
    return sendSuccess(res, toBridgeTransferDTO(row));
  } catch (err) {
    req.log.error({ err }, 'Failed to create bridge transfer');
    return sendError(res, 'Failed to create bridge transfer', null, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/bridge/transfers — the caller's transfers, statuses refreshed
// ---------------------------------------------------------------------------

router.get('/transfers', requireSessionWallet, async (req, res) => {
  const wallet = getSessionWallet(res);

  try {
    const rows = await listBridgeTransfers(wallet);
    const refreshed = await refreshTransfers(oneClickConfig(), rows);
    return sendSuccess(res, { transfers: refreshed.map(toBridgeTransferDTO) });
  } catch (err) {
    req.log.error({ err }, 'Failed to list bridge transfers');
    return sendError(res, 'Failed to list bridge transfers', null, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/bridge/transfers/:id — one transfer, status refreshed
// ---------------------------------------------------------------------------

router.get('/transfers/:id', requireSessionWallet, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) return sendError(res, 'Transfer not found.', null, 404);

  const wallet = getSessionWallet(res);

  try {
    const row = await getBridgeTransfer(id, wallet);
    if (!row) return sendError(res, 'Transfer not found.', null, 404);

    const refreshed = await refreshTransfer(oneClickConfig(), row);
    return sendSuccess(res, toBridgeTransferDTO(refreshed));
  } catch (err) {
    req.log.error({ err, bridgeTransferId: id }, 'Failed to read bridge transfer');
    return sendError(res, 'Failed to read bridge transfer', null, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/bridge/transfers/:id/deposit-tx — the outbound leg's tx hash
// ---------------------------------------------------------------------------

router.post('/transfers/:id/deposit-tx', requireSessionWallet, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) return sendError(res, 'Transfer not found.', null, 404);

  const { txHash } = (req.body ?? {}) as { txHash?: unknown };
  if (typeof txHash !== 'string' || !TX_HASH_RE.test(txHash.trim())) {
    return sendError(res, 'A valid transaction hash is required.', null, 400);
  }

  const wallet = getSessionWallet(res);

  try {
    const row = await getBridgeTransfer(id, wallet);
    if (!row) return sendError(res, 'Transfer not found.', null, 404);
    if (!row.depositAddress) return sendError(res, 'This transfer has no deposit address.', null, 409);

    // Telling 1Click which payment funded the address is what lets a memo'd
    // Stellar transfer be matched immediately instead of by polling. It is an
    // optimisation, not a requirement — a failure here does not lose the hash,
    // which is persisted either way.
    const submitted = await submitDepositTx(oneClickConfig(), {
      txHash: txHash.trim(),
      depositAddress: row.depositAddress,
      memo: row.depositMemo,
    });
    if (!submitted.ok) {
      req.log.warn({ bridgeTransferId: id, reason: submitted.reason }, 'Deposit tx not accepted by 1Click');
    }

    const updated = await attachSourceTxHash(id, txHash.trim());
    const refreshed = await refreshTransfer(oneClickConfig(), updated);
    return sendSuccess(res, toBridgeTransferDTO(refreshed));
  } catch (err) {
    req.log.error({ err, bridgeTransferId: id }, 'Failed to attach deposit tx');
    return sendError(res, 'Failed to attach deposit tx', null, 500);
  }
});

export default router;
