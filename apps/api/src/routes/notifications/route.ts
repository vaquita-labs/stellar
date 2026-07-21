import { Router } from 'express';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sendError,
  sendSuccess,
} from '@vaquita/shared';

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

export default router;
