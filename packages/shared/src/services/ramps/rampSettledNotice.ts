import { prisma } from '@vaquita/db';
import { notify, type NotificationInput } from '../notifications';
import { sendWebPushToWallet, type PushPayload } from '../notifications/pushSender';

/**
 * Telling the user that a local-currency purchase or withdrawal completed.
 *
 * Ramp rows are only ever closed from the user's own browser — either the
 * modal watching it live or the check that runs when the app opens — so the
 * route that closes one as `settled` is where both the in-app notification and
 * the push are emitted. Both closers may reach the same row; only the call that
 * actually changed it notifies.
 */

/** Where tapping the notification lands: the wallet, which shows the balance. */
export const RAMP_SETTLED_LINK = '/profile/wallet';

export type RampKind = 'onramp' | 'offramp';

export interface RampSettledNotice {
  notification: NotificationInput;
  push: PushPayload;
}

export interface RampSettledRow {
  id: string;
  walletAddress: string;
  amountFiat: string;
  currency: string;
}

type PushCopy = (kind: RampKind, amount: string, currency: string) => { title: string; body: string };

const PUSH_COPY_EN: PushCopy = (kind, amount, currency) =>
  kind === 'onramp'
    ? { title: 'Your deposit is complete', body: `${amount} ${currency} landed in your wallet.` }
    : { title: 'Your withdrawal is complete', body: `${amount} ${currency} were sent to your bank.` };

const PUSH_COPY: Record<string, PushCopy> = {
  en: PUSH_COPY_EN,
  es: (kind, amount, currency) =>
    kind === 'onramp'
      ? { title: 'Tu depósito se completó', body: `${amount} ${currency} llegaron a tu billetera.` }
      : { title: 'Tu retiro se completó', body: `${amount} ${currency} fueron enviados a tu banco.` },
  pt: (kind, amount, currency) =>
    kind === 'onramp'
      ? { title: 'Seu depósito foi concluído', body: `${amount} ${currency} chegaram à sua carteira.` }
      : { title: 'Seu saque foi concluído', body: `${amount} ${currency} foram enviados ao seu banco.` },
};

const twoDecimals = (value: string | number): string => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : String(value);
};

/**
 * What to send for a ramp row just closed, or null when there is nothing to say.
 *
 * Pure, so the rules are tested without a database. Only a close that moved the
 * row to `settled` notifies (`changed`); the dedupe key is a second guard for
 * two closes racing. A purchase shows the USDC that landed when the client
 * could read it, and the local amount paid otherwise; a withdrawal shows the
 * local amount sent to the bank.
 */
export const buildRampSettledNotice = (input: {
  kind: RampKind;
  row: RampSettledRow;
  status: string;
  changed: boolean;
  usdcAmount?: number | null | undefined;
  language?: string | null | undefined;
}): RampSettledNotice | null => {
  const { kind, row } = input;
  if (!input.changed || input.status !== 'settled') return null;

  const usdc = kind === 'onramp' && input.usdcAmount && input.usdcAmount > 0 ? input.usdcAmount : null;
  const amount = twoDecimals(usdc ?? row.amountFiat);
  const currency = usdc ? 'USDC' : row.currency;
  const copy = (PUSH_COPY[input.language ?? ''] ?? PUSH_COPY_EN)(kind, amount, currency);
  const key = `${kind}-settled-${row.id}`;

  return {
    notification: {
      walletAddress: row.walletAddress,
      type: 'deposit',
      messageKey: kind === 'onramp' ? 'onrampSettled' : 'offrampSettled',
      params: { amount, currency },
      link: RAMP_SETTLED_LINK,
      dedupeKey: key,
    },
    push: { ...copy, link: RAMP_SETTLED_LINK, tag: key },
  };
};

/**
 * Notify the owner of a ramp row that just closed as settled. Never throws: the
 * row is already closed, and a failed notification must not turn that into an
 * error the client would retry.
 */
export const notifyRampSettled = async (input: {
  kind: RampKind;
  row: RampSettledRow;
  status: string;
  changed: boolean;
  usdcAmount?: number | null | undefined;
}): Promise<void> => {
  try {
    if (!input.changed || input.status !== 'settled') return;

    const profile = await prisma.profile.findUnique({
      where: { walletAddress: input.row.walletAddress },
      select: { language: true },
    });
    const notice = buildRampSettledNotice({ ...input, language: profile?.language });
    if (!notice) return;

    await Promise.all([notify(notice.notification), sendWebPushToWallet(input.row.walletAddress, notice.push)]);
  } catch (error) {
    console.error('Error notifying a settled ramp', { kind: input.kind, id: input.row.id }, error);
  }
};
