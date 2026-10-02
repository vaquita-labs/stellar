/**
 * Minimal Telegram Bot API client for internal alerts sent to the team's group.
 * Only `sendMessage`; anything richer belongs in a real library.
 */

const TELEGRAM_API = 'https://api.telegram.org';
const TIMEOUT_MS = 5_000;
/** Telegram rejects longer messages outright instead of truncating them. */
export const TELEGRAM_TEXT_MAX = 4096;

export type TelegramTarget = {
  botToken: string;
  chatId: string;
  /** Topic id when the group has topics enabled; omitted for the General topic or a plain group. */
  threadId?: number;
};

export type TelegramSendResult = { ok: true } | { ok: false; reason: string };

/** Escapes text for `parse_mode: 'HTML'`, which only reserves these three characters. */
export const escapeTelegramHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Sends one HTML message. Never throws: an alert that cannot be delivered must
 * not fail the request that triggered it, so every failure comes back as a
 * reason for the caller to log.
 */
export async function sendTelegramMessage(target: TelegramTarget, html: string): Promise<TelegramSendResult> {
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${target.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: target.chatId,
        ...(target.threadId !== undefined ? { message_thread_id: target.threadId } : {}),
        text: html.slice(0, TELEGRAM_TEXT_MAX),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return { ok: true };
    // Telegram's `description` names the problem ("chat not found", "bot was
    // kicked") and never echoes the token back, so it is safe to log.
    const body = (await response.json().catch(() => null)) as { description?: string } | null;
    return { ok: false, reason: `${response.status} ${body?.description ?? response.statusText}` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
