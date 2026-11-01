import { Router } from 'express';
import {
  countRecentSupportMessages,
  createUserSupportMessage,
  getProfile,
  getSupportTicketForWallet,
  getSupportThreadForWallet,
  listSupportTicketsForWallet,
  sendError,
  sendSuccess,
  SUPPORT_HOURLY_LIMIT,
  SUPPORT_MESSAGE_MAX,
} from '@vaquita/shared';
import { notifySupportMessage } from '../../lib/supportAlerts';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';

/**
 * The user's side of the private Help Center chat (`/support`). The app polls
 * while a ticket screen is open; the team answers from apps/admin.
 *
 * The wallet comes from the session token, never from the request: it is the
 * only thing that decides whose tickets are read or written.
 */
const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** GET /api/v1/support/tickets — the caller's tickets, most recent activity first. */
router.get('/tickets', requireSessionWallet, async (req, res) => {
  try {
    const tickets = await listSupportTicketsForWallet(getSessionWallet(res));
    return sendSuccess(res, { tickets });
  } catch (err) {
    req.log.error({ err }, 'Failed to list support tickets');
    return sendError(res, 'Failed to load your conversations', null, 500);
  }
});

/** GET /api/v1/support/tickets/:id — one ticket with its messages, oldest first. */
router.get('/tickets/:id', requireSessionWallet, async (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : '';
  if (!UUID_RE.test(id)) return sendError(res, 'Conversation not found', null, 404);

  try {
    const ticket = await getSupportTicketForWallet(getSessionWallet(res), id);
    if (!ticket) return sendError(res, 'Conversation not found', null, 404);
    return sendSuccess(res, { ticket });
  } catch (err) {
    req.log.error({ err }, 'Failed to read a support ticket');
    return sendError(res, 'Failed to load the conversation', null, 500);
  }
});

/** GET /api/v1/support/messages — legacy single thread, oldest first. Kept as fallback. */
router.get('/messages', requireSessionWallet, async (req, res) => {
  try {
    const messages = await getSupportThreadForWallet(getSessionWallet(res));
    return sendSuccess(res, { messages });
  } catch (err) {
    req.log.error({ err }, 'Failed to read a support thread');
    return sendError(res, 'Failed to load the conversation', null, 500);
  }
});

/**
 * POST /api/v1/support/messages  { body, ticketId? } — appends a message.
 * Without ticketId, uses the open ticket or opens a new one. Returns ticketId
 * so "Nueva conversación" can navigate to the new chat.
 */
router.post('/messages', requireSessionWallet, async (req, res) => {
  const raw = (req.body ?? {}) as { body?: unknown; ticketId?: unknown };
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!body) return sendError(res, 'A message is required.', null, 400);
  if (body.length > SUPPORT_MESSAGE_MAX) {
    return sendError(res, `The message must be at most ${SUPPORT_MESSAGE_MAX} characters.`, null, 400);
  }

  const ticketId =
    typeof raw.ticketId === 'string' && raw.ticketId.trim().length > 0 ? raw.ticketId.trim() : null;
  if (ticketId !== null && !UUID_RE.test(ticketId)) {
    return sendError(res, 'Conversation not found', null, 404);
  }

  const wallet = getSessionWallet(res);

  try {
    if ((await countRecentSupportMessages(wallet)) >= SUPPORT_HOURLY_LIMIT) {
      return sendError(res, 'Too many messages sent in the last hour. Please try again later.', null, 429);
    }

    const { profileData } = await getProfile(wallet);
    const created = await createUserSupportMessage({
      walletAddress: wallet,
      profileId: profileData?.id ?? null,
      body,
      ticketId,
    });
    if (!created) return sendError(res, 'Conversation not found', null, 404);

    const { message, conversationId, ticketId: landedIn, kind } = created;

    notifySupportMessage(
      {
        kind,
        conversationId,
        ticketId: landedIn,
        walletAddress: wallet,
        nickname: profileData?.nickname || null,
        body,
      },
      req.log,
    );

    req.log.info({ supportMessageId: message.id, ticketId: landedIn }, 'Support message stored');
    return sendSuccess(res, { message, ticketId: landedIn });
  } catch (err) {
    req.log.error({ err }, 'Failed to store a support message');
    return sendError(res, 'Failed to send your message', null, 500);
  }
});

export default router;
