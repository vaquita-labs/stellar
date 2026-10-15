import { prisma } from '@vaquita/db';
import { notify, type NotificationInput } from '../notifications';
import { sendWebPushToWallet, type PushPayload } from '../notifications/pushSender';

/**
 * Telling the user that the money they said they were sending from another app
 * (Binance, Meru…) landed in their wallet.
 *
 * Emitted once per deposit intent, by whichever path closes it first — the
 * open-intent read, the client's `arrived` report or the API watcher — so the
 * push reaches a user who closed the app while waiting.
 */

/** Where tapping the notification lands: the wallet, which shows the balance. */
export const DEPOSIT_RECEIVED_LINK = '/profile/wallet';

export interface DepositReceivedNotice {
  notification: NotificationInput;
  push: PushPayload;
}

type PushCopy = (amount: string, platform: string) => { title: string; body: string };

const PUSH_COPY_EN: PushCopy = (amount, platform) => ({
  title: 'Your deposit arrived',
  body: `You received ${amount} USDC from ${platform}.`,
});

const PUSH_COPY: Record<string, PushCopy> = {
  en: PUSH_COPY_EN,
  es: (amount, platform) => ({ title: 'Llegó tu depósito', body: `Recibiste ${amount} USDC desde ${platform}.` }),
  pt: (amount, platform) => ({ title: 'Seu depósito chegou', body: `Você recebeu ${amount} USDC de ${platform}.` }),
};

/**
 * What to send for an intent that just arrived. Pure, so the copy and keys are
 * tested without a database. The dedupe key is per intent: one waiting card,
 * one notice, however many paths race to close it.
 */
export const buildDepositReceivedNotice = (input: {
  intentId: string;
  walletAddress: string;
  amount: number;
  platformName: string;
  language?: string | null | undefined;
}): DepositReceivedNotice => {
  const amount = input.amount.toFixed(2);
  const platform = input.platformName;
  const copy = (PUSH_COPY[input.language ?? ''] ?? PUSH_COPY_EN)(amount, platform);
  const key = `deposit-received-${input.intentId}`;

  return {
    notification: {
      walletAddress: input.walletAddress,
      type: 'deposit',
      messageKey: 'depositReceived',
      params: { amount, platform },
      link: DEPOSIT_RECEIVED_LINK,
      dedupeKey: key,
    },
    push: { ...copy, link: DEPOSIT_RECEIVED_LINK, tag: key },
  };
};

/**
 * Notify the owner of an intent that its deposit arrived. Never throws: the
 * money is already there and the intent already closed; a failed notice must
 * not turn that into an error for the caller.
 */
export const notifyDepositReceived = async (input: {
  intentId: string;
  profileId: number;
  walletAddress: string;
  amount: number;
  platformName: string;
}): Promise<void> => {
  try {
    const profile = await prisma.profile.findUnique({ where: { id: input.profileId }, select: { language: true } });
    const notice = buildDepositReceivedNotice({ ...input, language: profile?.language });
    await Promise.all([notify(notice.notification), sendWebPushToWallet(input.walletAddress, notice.push)]);
  } catch (error) {
    console.error('Error notifying a received deposit', { depositIntentId: input.intentId }, error);
  }
};
