import { Router } from 'express';
import {
  countRecentSupportMessages,
  createUserSupportMessage,
  getProfile,
  getSupportThreadForWallet,
  sendError,
  sendSuccess,
  SUPPORT_HOURLY_LIMIT,
  SUPPORT_MESSAGE_MAX,
} from '@vaquita/shared';
import { notifySupportMessage } from '../../lib/supportAlerts';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';

/**
 * The user's side of the private Help Center chat (`/support`). The app polls
 * GET while the chat screen is open; the team answers from apps/admin, which
 * reads Prisma directly.
 *
 * The wallet comes from the session token, never from the request: it is the
 * only thing that decides whose thread is read or written.
 */
const router = Router();

/** GET /api/v1/support/messages — the caller's thread, oldest first. */
router.get('/messages', requireSessionWallet, async (req, res) => {
  try {
    const messages = await getSupportThreadForWallet(getSessionWallet(res));
    return sendSuccess(res, { messages });
  } catch (err) {
    req.log.error({ err }, 'Failed to read a support thread');
    return sendError(res, 'Failed to load the conversation', null, 500);
  }
});

/** POST /api/v1/support/messages  { body } — appends a message, opening the thread on the first one. */
router.post('/messages', requireSessionWallet, async (req, res) => {
  const raw = (req.body ?? {}) as { body?: unknown };
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!body) return sendError(res, 'A message is required.', null, 400);
  if (body.length > SUPPORT_MESSAGE_MAX) {
    return sendError(res, `The message must be at most ${SUPPORT_MESSAGE_MAX} characters.`, null, 400);
  }

  const wallet = getSessionWallet(res);

  try {
    if ((await countRecentSupportMessages(wallet)) >= SUPPORT_HOURLY_LIMIT) {
      return sendError(res, 'Too many messages sent in the last hour. Please try again later.', null, 429);
    }

    // Optional: the thread is keyed by wallet and has to work for a user whose
    // profile row is missing, which is exactly when they would be writing in.
    const { profileData } = await getProfile(wallet);
    const { message, conversationId, kind } = await createUserSupportMessage({
      walletAddress: wallet,
      profileId: profileData?.id ?? null,
      body,
    });

    // After the write, not before: the alert links to a thread that has to exist.
    notifySupportMessage(
      { kind, conversationId, walletAddress: wallet, nickname: profileData?.nickname || null, body },
      req.log,
    );

    // Not logging the body: it is the user's own words, often about their money.
    req.log.info({ supportMessageId: message.id }, 'Support message stored');
    return sendSuccess(res, { message });
  } catch (err) {
    req.log.error({ err }, 'Failed to store a support message');
    return sendError(res, 'Failed to send your message', null, 500);
  }
});

export default router;
