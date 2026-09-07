import { Router } from 'express';
import {
  advanceOfframpWithdrawal,
  findOpenOfframpWithdrawal,
  markOfframpWithdrawalTerminal,
  prismaOfframpWithdrawalRepository,
  sendError,
  sendSuccess,
  startOfframpWithdrawal,
  type OfframpStep,
} from '@vaquita/shared';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';
import { refreshWalletBalanceAfterEvent } from '../../lib/walletBalanceRefresh';

/**
 * Retiros a moneda local (`/offramp`).
 *
 * Espejo de `/onramp`, con una diferencia que define el orden de las llamadas:
 * acá el USDC sale del vault ANTES de que exista el retiro del lado del
 * proveedor, así que la fila se abre primero (`POST /withdrawals`) y recién
 * después se la completa con el id que devuelve la creación. Un retiro que
 * falla en el medio deja la fila sin `providerTxId` — que es exactamente el
 * caso que esto existe para no perder.
 *
 * Todas las rutas usan `requireSessionWallet`, nunca `requireWalletSession`:
 * `requireWalletSession` respeta el escape hatch `WALLET_AUTH_ENFORCE` y deja
 * pasar llamadas sin autenticar cuando está apagado, lo que acá dejaría a
 * cualquiera leer —o cerrar— el retiro de otra wallet. La wallet sale de la
 * sesión, así que en la URL y en el body no hay nada que falsificar.
 */
const router = Router();

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const STEPS: OfframpStep[] = ['funds', 'create', 'payout'];

/** El retiro que la wallet dejó a medias, para retomarlo al abrir el modal. */
router.get('/withdrawals/open', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);
  req.log.info({ walletAddress }, 'GET /offramp/withdrawals/open');

  try {
    const withdrawal = await findOpenOfframpWithdrawal(prismaOfframpWithdrawalRepository, walletAddress);
    if (!withdrawal) return sendSuccess(res, { state: 'none' });

    return sendSuccess(res, {
      state: 'open',
      withdrawal: {
        id: withdrawal.id,
        providerTxId: withdrawal.providerTxId ?? '',
        provider: withdrawal.provider ?? '',
        country: withdrawal.country,
        rail: withdrawal.rail ?? '',
        amountFiat: withdrawal.amountFiat,
        currency: withdrawal.currency,
        usdcAmount: withdrawal.usdcAmount ?? '',
        vaultWithdrawHash: withdrawal.vaultWithdrawHash ?? '',
        paymentHash: withdrawal.paymentHash ?? '',
        step: withdrawal.step,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt.toISOString(),
      },
    });
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to read open off-ramp withdrawal');
    return sendError(res, 'Failed to read open off-ramp withdrawal', err, 500);
  }
});

/**
 * Abre el retiro ANTES de sacar el USDC del vault.
 *
 * Va primero a propósito: si se registrara recién al crear con el proveedor,
 * los retiros que se caen entre el vault y la rampa —los únicos que dejan plata
 * colgada— no dejarían rastro en ningún lado.
 */
router.post('/withdrawals', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);
  const { country, amountFiat, currency, provider, rail, usdcAmount } = req.body ?? {};
  req.log.info({ walletAddress, country, provider, rail }, 'POST /offramp/withdrawals');

  const values = {
    country: asString(country),
    amountFiat: asString(amountFiat),
    currency: asString(currency),
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    return sendError(res, `Missing or empty: ${missing.join(', ')}.`, null, 400);
  }
  if (values.country!.length !== 2) {
    return sendError(res, 'country must be a two-letter code.', null, 400);
  }

  try {
    const withdrawal = await startOfframpWithdrawal(prismaOfframpWithdrawalRepository, {
      walletAddress,
      country: values.country!.toUpperCase(),
      amountFiat: values.amountFiat!,
      currency: values.currency!.toUpperCase(),
      provider: asString(provider),
      rail: asString(rail),
      usdcAmount: asString(usdcAmount),
    });

    req.log.info({ walletAddress, withdrawalId: withdrawal.id }, 'Off-ramp withdrawal opened');
    return sendSuccess(res, { id: withdrawal.id, status: withdrawal.status });
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to open off-ramp withdrawal');
    return sendError(res, 'Failed to open off-ramp withdrawal', err, 500);
  }
});

/**
 * Anota el avance: hasta qué paso llegó y qué acuses dejó por el camino.
 *
 * Sólo viaja lo que el paso conoce, así que un paso tardío no puede borrar lo
 * que anotó el anterior. Un retiro ya cerrado no se toca.
 */
router.patch('/withdrawals/:id', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);
  const id = asString(req.params.id);
  const { step, providerTxId, provider, rail, usdcAmount, vaultWithdrawHash, paymentHash } = req.body ?? {};
  req.log.info({ walletAddress, withdrawalId: id, step }, 'PATCH /offramp/withdrawals/:id');

  if (!id) return sendError(res, 'Missing withdrawal id.', null, 400);
  if (step !== undefined && !STEPS.includes(step)) {
    return sendError(res, `step must be one of: ${STEPS.join(', ')}.`, null, 400);
  }

  // `undefined` (la clave no vino) y `null` (vino vacía) significan cosas
  // distintas aguas abajo, así que sólo se arma lo que realmente mandaron.
  const patch: Record<string, unknown> = {};
  if (step !== undefined) patch.step = step;
  for (const [key, value] of Object.entries({ providerTxId, provider, rail, usdcAmount, vaultWithdrawHash, paymentHash })) {
    if (value !== undefined) patch[key] = asString(value);
  }

  try {
    const withdrawal = await advanceOfframpWithdrawal(prismaOfframpWithdrawalRepository, {
      walletAddress,
      id,
      ...patch,
    });
    // Un retiro que no existe o es de otra wallet es lo mismo para quien llama:
    // no hay nada que pueda tocar.
    if (!withdrawal) return sendError(res, 'Withdrawal not found.', null, 404);

    return sendSuccess(res, { id: withdrawal.id, step: withdrawal.step, status: withdrawal.status });
  } catch (err) {
    req.log.error({ err, walletAddress, withdrawalId: id }, 'Failed to advance off-ramp withdrawal');
    return sendError(res, 'Failed to advance off-ramp withdrawal', err, 500);
  }
});

/**
 * Cierra un retiro: acreditado, fallado, o abandonado por el usuario.
 *
 * Idempotente: el primer desenlace es el que vale, así que un fallo que llega
 * tarde no puede convertir en fallido un retiro ya acreditado.
 */
router.post('/withdrawals/:id/terminal', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);
  const id = asString(req.params.id);
  const { status, errorReason } = req.body ?? {};
  req.log.info({ walletAddress, withdrawalId: id, status }, 'POST /offramp/withdrawals/:id/terminal');

  if (!id) return sendError(res, 'Missing withdrawal id.', null, 400);
  if (status !== 'settled' && status !== 'failed' && status !== 'abandoned') {
    return sendError(res, 'status must be one of: settled, failed, abandoned.', null, 400);
  }

  try {
    const withdrawal = await markOfframpWithdrawalTerminal(prismaOfframpWithdrawalRepository, {
      walletAddress,
      id,
      status,
      errorReason: asString(errorReason),
    });
    if (!withdrawal) return sendError(res, 'Withdrawal not found.', null, 404);

    // Sólo un retiro acreditado movió plata on-chain; los otros desenlaces
    // dejan el saldo igual y no justifican una lectura RPC.
    if (withdrawal.status === 'settled') {
      refreshWalletBalanceAfterEvent(walletAddress, req.log, 'offramp-settled');
    }

    return sendSuccess(res, { id: withdrawal.id, status: withdrawal.status });
  } catch (err) {
    req.log.error({ err, walletAddress, withdrawalId: id }, 'Failed to close off-ramp withdrawal');
    return sendError(res, 'Failed to close off-ramp withdrawal', err, 500);
  }
});

export default router;
