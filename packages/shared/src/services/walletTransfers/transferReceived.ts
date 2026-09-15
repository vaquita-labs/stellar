import { prisma } from '@vaquita/db';
import { notify, type NotificationInput } from '../notifications';
import { sendWebPushToWallet, type PushPayload } from '../notifications/pushSender';
import type { WalletTransferRecord } from './walletTransfers';

/**
 * Telling the receiver of a peer-to-peer payment that money arrived.
 *
 * Until this, a user paid by @username learned about it only by noticing their
 * balance had moved. The payment is recorded by the SENDER's client, so this is
 * the one place the server knows both sides: the in-app notification (which
 * also feeds the "you received money" modal on the receiver's next open) and a
 * push are both emitted from here.
 */

/** Where tapping the notification lands: the wallet, which shows the balance. */
export const TRANSFER_RECEIVED_LINK = '/profile/wallet';

export interface TransferReceivedNotice {
  notification: NotificationInput;
  push: PushPayload;
}

/** The sender as the receiver will read it: their tag, or a shortened address. */
const senderName = (senderWallet: string, senderNickname: string | null | undefined): string => {
  const tag = senderNickname?.trim();
  if (tag) return `@${tag}`;
  return `${senderWallet.slice(0, 4)}…${senderWallet.slice(-4)}`;
};

type PushCopy = (name: string, amount: string) => { title: string; body: string };

const PUSH_COPY_EN: PushCopy = (name, amount) => ({ title: 'You received money', body: `${name} sent you ${amount} USDC.` });

const PUSH_COPY: Record<string, PushCopy> = {
  en: PUSH_COPY_EN,
  es: (name, amount) => ({ title: 'Recibiste dinero', body: `${name} te envió ${amount} USDC.` }),
  pt: (name, amount) => ({ title: 'Você recebeu dinheiro', body: `${name} te enviou ${amount} USDC.` }),
};

/**
 * What to send for a recorded transfer, or null when there is nobody to tell.
 *
 * Pure, so the rules are tested without a database. Only a payment to a Vaquita
 * user notifies, and only the first time the row is written: `inserted` is
 * false on a client retry of the same hash, and the dedupe key is a second
 * guard for two requests racing the same insert.
 *
 * Push text is composed here rather than in the web bundles, because a push is
 * shown by the OS without the app running; the in-app copy stays in i18n and
 * only receives `name` and `amount`.
 */
export const buildTransferReceivedNotice = (input: {
  transfer: Pick<WalletTransferRecord, 'id' | 'walletAddress' | 'amount' | 'destinationAddress' | 'destinationKind'>;
  inserted: boolean;
  senderNickname?: string | null | undefined;
  receiverLanguage?: string | null | undefined;
}): TransferReceivedNotice | null => {
  const { transfer, inserted } = input;
  if (!inserted || transfer.destinationKind !== 'vaquita_user') return null;

  const name = senderName(transfer.walletAddress, input.senderNickname);
  const amount = Number(transfer.amount).toFixed(2);
  const copy = (PUSH_COPY[input.receiverLanguage ?? ''] ?? PUSH_COPY_EN)(name, amount);

  return {
    notification: {
      walletAddress: transfer.destinationAddress,
      type: 'deposit',
      messageKey: 'transferReceived',
      params: { name, amount },
      link: TRANSFER_RECEIVED_LINK,
      dedupeKey: `transfer-received-${transfer.id}`,
    },
    push: { ...copy, link: TRANSFER_RECEIVED_LINK, tag: `transfer-received-${transfer.id}` },
  };
};

/**
 * Notify the receiver of a just-recorded transfer. Never throws: the payment
 * already happened and was recorded, and a failed notification must not turn
 * that into an error the sender's client would retry.
 */
export const notifyTransferReceived = async (
  transfer: WalletTransferRecord,
  inserted: boolean,
): Promise<void> => {
  try {
    if (!inserted || transfer.destinationKind !== 'vaquita_user') return;

    const [sender, receiver] = await Promise.all([
      prisma.profile.findUnique({ where: { walletAddress: transfer.walletAddress }, select: { nickname: true } }),
      prisma.profile.findUnique({ where: { walletAddress: transfer.destinationAddress }, select: { language: true } }),
    ]);

    const notice = buildTransferReceivedNotice({
      transfer,
      inserted,
      senderNickname: sender?.nickname,
      receiverLanguage: receiver?.language,
    });
    if (!notice) return;

    await Promise.all([notify(notice.notification), sendWebPushToWallet(transfer.destinationAddress, notice.push)]);
  } catch (error) {
    console.error('Error notifying a received transfer', { transferId: transfer.id }, error);
  }
};
