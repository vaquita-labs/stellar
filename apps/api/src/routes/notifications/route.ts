import { Router } from 'express';
import {
  deletePushSubscription,
  hasPushSubscription,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  savePushSubscription,
  sendAdminCampaign,
  sendError,
  sendSuccess,
  sendWebPushToWallet,
} from '@vaquita/shared';
import { requireAdminSecret } from '../../lib/adminSecret';
import { requireWalletSession } from '../../lib/walletAuth';

const router = Router();

// Single-network + wallet-trust auth, same as the rest of the API: the viewer is
// identified by the `walletAddress` in the URL, no session/JWT.

/**
 * GET /api/v1/notifications/wallet/:walletAddress
 * The viewer's notification feed (latest first, capped server-side), plus the
 * unread count for the bell badge. Reading also runs the lazy deposit-unlock
 * sweep, so "you can withdraw now" rows appear without a cron.
 */
router.get('/wallet/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /notifications/wallet/:walletAddress');
  return sendSuccess(res, await listNotifications(walletAddress));
});

/**
 * POST /api/v1/notifications/wallet/:walletAddress/read  { id }
 * Marks one notification as read. Idempotent.
 */
router.post('/wallet/:walletAddress/read', async (req, res) => {
  const { walletAddress } = req.params;
  const id = String(req.body?.id ?? '').trim();
  req.log.info({ walletAddress, id }, 'POST /notifications/wallet/:walletAddress/read');

  if (!/^\d+$/.test(id)) {
    return sendError(res, 'A notification id is required.', null, 400);
  }

  return sendSuccess(res, await markNotificationRead(walletAddress, id));
});

/**
 * POST /api/v1/notifications/wallet/:walletAddress/read-all
 * Marks every notification as read. Idempotent.
 */
router.post('/wallet/:walletAddress/read-all', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'POST /notifications/wallet/:walletAddress/read-all');
  return sendSuccess(res, await markAllNotificationsRead(walletAddress));
});

/**
 * POST /api/v1/notifications/wallet/:walletAddress/push-subscribe
 * Registers this device's web-push subscription. Session-protected: without it
 * anyone could point their own device at another wallet's notifications.
 * Upserts by endpoint, so re-subscribing (or switching accounts on the same
 * device) never duplicates rows.
 */
router.post('/wallet/:walletAddress/push-subscribe', requireWalletSession, async (req, res) => {
  const { walletAddress } = req.params;
  const { endpoint, keys } = req.body ?? {};
  req.log.info({ walletAddress }, 'POST /notifications/wallet/:walletAddress/push-subscribe');

  try {
    return sendSuccess(
      res,
      await savePushSubscription({
        walletAddress,
        endpoint: String(endpoint ?? ''),
        keys: { p256dh: String(keys?.p256dh ?? ''), auth: String(keys?.auth ?? '') },
        userAgent: req.get('user-agent') ?? undefined,
      })
    );
  } catch (error) {
    return sendError(res, error instanceof Error ? error.message : 'Invalid subscription.', null, 400);
  }
});

/**
 * POST /api/v1/notifications/wallet/:walletAddress/push-unsubscribe  { endpoint }
 * Drops this device's subscription (scoped to the caller's wallet). Idempotent.
 */
router.post('/wallet/:walletAddress/push-unsubscribe', requireWalletSession, async (req, res) => {
  const { walletAddress } = req.params;
  const endpoint = String(req.body?.endpoint ?? '');
  req.log.info({ walletAddress }, 'POST /notifications/wallet/:walletAddress/push-unsubscribe');
  return sendSuccess(res, await deletePushSubscription(walletAddress, endpoint));
});

/**
 * POST /api/v1/notifications/admin/push-test  { walletAddress, title, body, link? }
 * Envía un push real a todos los dispositivos de una wallet. Gate admin
 * (x-admin-secret): existe para probar el pipeline completo device-in-hand
 * antes de que el admin UI (fase 3) tome el rol de emisor.
 */
router.post('/admin/push-test', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const { walletAddress, title, body, link } = req.body ?? {};
  req.log.info({ walletAddress }, 'POST /notifications/admin/push-test');

  if (!walletAddress || !title || !body) {
    return sendError(res, 'walletAddress, title and body are required.', null, 400);
  }

  const result = await sendWebPushToWallet(String(walletAddress), {
    title: String(title),
    body: String(body),
    link: typeof link === 'string' ? link : undefined,
  });
  return sendSuccess(res, result);
});

/**
 * POST /api/v1/notifications/admin/send
 * { title, body, link?, audience: 'all'|'usernames', usernames?: string[] }
 * Envía una campaña del admin: notificación in-app (con broadcast Ably) + push
 * a los suscritos, y guarda el snapshot en push_campaigns. Lo llama la ruta
 * proxy del admin (apps/admin) — el envío vive aquí porque `notify()` necesita
 * el env completo del API (Ably, etc.).
 */
router.post('/admin/send', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const { title, body, link, audience, usernames } = req.body ?? {};
  req.log.info({ audience }, 'POST /notifications/admin/send');

  const cleanTitle = String(title ?? '').trim();
  const cleanBody = String(body ?? '').trim();
  const cleanLink = typeof link === 'string' ? link.trim() : '';
  if (!cleanTitle || cleanTitle.length > 120 || !cleanBody || cleanBody.length > 500) {
    return sendError(res, 'title (≤120) and body (≤500) are required.', null, 400);
  }
  if (cleanLink && (!/^\/[^\s]*$/.test(cleanLink) || cleanLink.length > 300)) {
    return sendError(res, 'link must be an internal route like /home.', null, 400);
  }
  if (audience !== 'all' && audience !== 'usernames') {
    return sendError(res, "audience must be 'all' or 'usernames'.", null, 400);
  }

  const result = await sendAdminCampaign({
    title: cleanTitle,
    body: cleanBody,
    link: cleanLink || null,
    audience,
    usernames: Array.isArray(usernames) ? usernames.map(String).slice(0, 500) : [],
  });

  if (!result.ok) return sendError(res, result.message, null, 400);
  return sendSuccess(res, {
    campaign: result.campaign,
    push: result.push,
    notFound: result.notFound.length ? result.notFound : undefined,
  });
});

/**
 * GET /api/v1/notifications/wallet/:walletAddress/push-status?endpoint=…
 * Whether the wallet (or this specific device) has a live subscription — drives
 * the Settings toggle initial state.
 */
router.get('/wallet/:walletAddress/push-status', async (req, res) => {
  const { walletAddress } = req.params;
  const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : undefined;
  return sendSuccess(res, await hasPushSubscription(walletAddress, endpoint));
});

export default router;
