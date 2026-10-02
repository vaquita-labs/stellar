import { apiServicesEnv } from '@vaquita/shared/config/apiServicesEnv';
import { escapeTelegramHtml, sendTelegramMessage, type SupportMessageKind } from '@vaquita/shared';
import type { Logger } from 'pino';

/** Enough of the message to triage from the phone; the admin screen has the rest. */
const PREVIEW_MAX = 500;

const HEADLINES: Record<SupportMessageKind, string> = {
  new: '🆕 <b>New support chat</b>',
  reopened: '🔁 <b>Support chat reopened</b>',
  followup: '💬 <b>New support message</b>',
};

export type SupportAlertInput = {
  kind: SupportMessageKind;
  conversationId: string;
  walletAddress: string;
  nickname: string | null;
  body: string;
  adminUrl?: string | undefined;
};

/** The alert as Telegram HTML. Everything the user controls is escaped. */
export function buildSupportAlert({
  kind,
  conversationId,
  walletAddress,
  nickname,
  body,
  adminUrl,
}: SupportAlertInput) {
  const who = nickname ? `<b>@${escapeTelegramHtml(nickname)}</b> · ` : '';
  const wallet = `<code>${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}</code>`;
  const preview = body.length > PREVIEW_MAX ? `${body.slice(0, PREVIEW_MAX)}…` : body;
  const lines = [HEADLINES[kind], `${who}${wallet}`, `<blockquote>${escapeTelegramHtml(preview)}</blockquote>`];
  if (adminUrl) {
    const link = `${adminUrl.replace(/\/$/, '')}/support?c=${encodeURIComponent(conversationId)}`;
    lines.push(`<a href="${escapeTelegramHtml(link)}">Open in admin</a>`);
  }
  return lines.join('\n');
}

/**
 * Posts a new user message to the team's Telegram group. Fire-and-forget: the
 * caller does not await it, so a slow or failing Telegram never delays or fails
 * the user's send. Skipped when the bot is not configured.
 */
export function notifySupportMessage(input: Omit<SupportAlertInput, 'adminUrl'>, log: Logger): void {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_SUPPORT_CHAT_ID, TELEGRAM_SUPPORT_THREAD_ID, ADMIN_APP_URL } = apiServicesEnv;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_SUPPORT_CHAT_ID) return;

  const html = buildSupportAlert({ ...input, adminUrl: ADMIN_APP_URL });
  void sendTelegramMessage(
    {
      botToken: TELEGRAM_BOT_TOKEN,
      chatId: TELEGRAM_SUPPORT_CHAT_ID,
      ...(TELEGRAM_SUPPORT_THREAD_ID !== undefined ? { threadId: TELEGRAM_SUPPORT_THREAD_ID } : {}),
    },
    html,
  ).then((result) => {
    if (!result.ok) {
      log.warn({ conversationId: input.conversationId, reason: result.reason }, 'Support Telegram alert failed');
    }
  });
}
