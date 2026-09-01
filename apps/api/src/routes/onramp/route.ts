import { Router } from 'express';
import {
  findPendingOnrampPurchase,
  markOnrampPurchaseTerminal,
  prismaOnrampPurchaseRepository,
  recordOnrampPurchase,
  sendError,
  sendSuccess,
} from '@vaquita/shared';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';

/**
 * Compras de USDC con moneda local (`/onramp`).
 *
 * Existe por una limitación de la API de ramps: no hay endpoint de listado, así
 * que el id que devuelve la creación es el único handle sobre una compra en
 * curso. Si se pierde, el usuario ya pagó y no hay forma de volver a su
 * pantalla.
 *
 * Las dos rutas usan `requireSessionWallet`, nunca `requireWalletSession`:
 * `requireWalletSession` respeta el escape hatch `WALLET_AUTH_ENFORCE` y deja
 * pasar llamadas sin autenticar cuando está apagado, lo que acá dejaría a
 * cualquiera escribir —o leer— la compra de otra wallet. La wallet sale de la
 * sesión, así que en la URL y en el body no hay nada que falsificar.
 */
const router = Router();

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** La compra que la wallet dejó a medias, para retomarla al abrir el modal. */
router.get('/purchases/pending', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);
  req.log.info({ walletAddress }, 'GET /onramp/purchases/pending');

  try {
    const found = await findPendingOnrampPurchase(prismaOnrampPurchaseRepository, walletAddress);
    if (found.state === 'none') return sendSuccess(res, { state: 'none' });

    const { purchase } = found;
    return sendSuccess(res, {
      state: found.state,
      purchase: {
        id: purchase.id,
        providerTxId: purchase.providerTxId,
        provider: purchase.provider,
        country: purchase.country,
        amountFiat: purchase.amountFiat,
        currency: purchase.currency,
        status: purchase.status,
        expiresAt: purchase.expiresAt?.toISOString() ?? '',
        createdAt: purchase.createdAt.toISOString(),
      },
    });
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to read pending on-ramp purchase');
    return sendError(res, 'Failed to read pending on-ramp purchase', err, 500);
  }
});

/** Deja registrada una compra recién creada con el proveedor. */
router.post('/purchases', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);
  const { providerTxId, provider, country, amountFiat, currency, expiresAt } = req.body ?? {};
  req.log.info({ walletAddress, providerTxId, provider, country }, 'POST /onramp/purchases');

  const values = {
    providerTxId: asString(providerTxId),
    provider: asString(provider),
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

  // Una expiración ilegible se descarta en vez de rechazar la compra: el id ya
  // existe del lado del proveedor y perderlo es mucho peor que quedarse sin
  // saber cuándo vence el QR.
  const expiry = asString(expiresAt) ? new Date(String(expiresAt)) : null;
  const validExpiry = expiry && !Number.isNaN(expiry.getTime()) ? expiry : null;

  try {
    const purchase = await recordOnrampPurchase(prismaOnrampPurchaseRepository, {
      walletAddress,
      providerTxId: values.providerTxId!,
      provider: values.provider!,
      country: values.country!.toUpperCase(),
      amountFiat: values.amountFiat!,
      currency: values.currency!.toUpperCase(),
      expiresAt: validExpiry,
    });

    req.log.info({ walletAddress, purchaseId: purchase.id }, 'On-ramp purchase recorded');
    return sendSuccess(res, { id: purchase.id, status: purchase.status });
  } catch (err) {
    req.log.error({ err, walletAddress, providerTxId }, 'Failed to record on-ramp purchase');
    return sendError(res, 'Failed to record on-ramp purchase', err, 500);
  }
});

/**
 * Cierra una compra: acreditada, vencida, rechazada o cancelada por el usuario.
 *
 * Sólo la wallet de la sesión puede cerrar la suya, y el servicio ignora el
 * segundo cierre — el poller del modal y el usuario volviendo a la pantalla
 * pueden llegar los dos, y el que llega tarde no puede convertir una compra ya
 * acreditada en una fallida.
 */
router.post('/purchases/:id/terminal', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);
  const id = asString(req.params.id);
  const { status, errorReason } = req.body ?? {};
  req.log.info({ walletAddress, purchaseId: id, status }, 'POST /onramp/purchases/:id/terminal');

  if (!id) return sendError(res, 'Missing purchase id.', null, 400);
  if (status !== 'settled' && status !== 'expired' && status !== 'failed' && status !== 'cancelled') {
    return sendError(res, 'status must be one of: settled, expired, failed, cancelled.', null, 400);
  }

  try {
    const purchase = await markOnrampPurchaseTerminal(prismaOnrampPurchaseRepository, {
      walletAddress,
      id,
      status,
      errorReason: asString(errorReason),
    });
    // Una compra que no existe o es de otra wallet es lo mismo para quien llama:
    // no hay nada que pueda cerrar.
    if (!purchase) return sendError(res, 'Purchase not found.', null, 404);

    return sendSuccess(res, { id: purchase.id, status: purchase.status });
  } catch (err) {
    req.log.error({ err, walletAddress, purchaseId: id }, 'Failed to close on-ramp purchase');
    return sendError(res, 'Failed to close on-ramp purchase', err, 500);
  }
});

export default router;
