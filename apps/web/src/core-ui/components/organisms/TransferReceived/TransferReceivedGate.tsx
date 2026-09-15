'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowDownLeft } from 'react-icons/fi';
import { formatTokenPrecise } from '../../../helpers/numbers';
import { type AppNotification, useMarkNotificationRead, useNotifications } from '../../../hooks';
import { useAutoModalSlot } from '../../../stores';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

const MESSAGE_KEY = 'transferReceived';
const WALLET_ROUTE = '/profile/wallet';

const amountOf = (n: AppNotification) => Number(n.params.amount) || 0;

/**
 * "Another user sent you money", shown once on the next open.
 *
 * The server writes a `transferReceived` notification when a payment to this
 * user is recorded; that row is the whole state. Unread ones open this modal,
 * and closing it marks them read, so it never comes back for the same payment
 * while the notification stays in the center.
 *
 * It does not trust a persisted feed that is about to refetch: its unread rows
 * could be ones the user already closed on another device. What is shown is
 * frozen when it opens, because marking read flips the same rows the filter
 * reads.
 */
export function TransferReceivedGate() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isFetchedAfterMount, fetchStatus } = useNotifications();
  const markRead = useMarkNotificationRead();
  const [shown, setShown] = useState<AppNotification[] | null>(null);
  const [done, setDone] = useState(false);

  // Answered once nothing is in flight: fetched on this mount, or idle because
  // the query is disabled (no wallet yet), failed, or the cache is fresh
  // enough that mounting does not refetch. Waiting only for
  // `isFetchedAfterMount` would park the modals behind this one in those cases.
  const answered = isFetchedAfterMount || fetchStatus === 'idle';
  const unread = answered ? (data?.notifications ?? []).filter((n) => !n.read && n.messageKey === MESSAGE_KEY) : [];
  const settled = done || (answered && unread.length === 0 && !shown);

  const isMyTurn = useAutoModalSlot('transfer-received', settled);

  // Adjusting state while rendering, React's pattern for state derived once
  // from props: it re-renders immediately, before anything is painted.
  if (isMyTurn && !done && !shown && unread.length > 0) setShown(unread);

  if (!shown || done) return null;

  const close = (goToWallet: boolean) => {
    setDone(true);
    // A failed POST shows nothing: the row stays unread and the modal returns
    // on the next open, which is right for a payment nobody acknowledged.
    for (const n of shown) markRead.mutate(n.id);
    if (goToWallet) router.push(WALLET_ROUTE);
  };

  const total = shown.reduce((sum, n) => sum + amountOf(n), 0);
  const single = shown.length === 1 ? shown[0] : null;

  return (
    <AppModal
      open
      onOpenChange={() => close(false)}
      title={t('transferReceived.modal.title', 'You received money')}
      size="sm"
      footer={
        <div className="flex w-full flex-col gap-2">
          <PressableButton variant="primary" size="cta" onClick={() => close(true)}>
            {t('transferReceived.modal.viewWallet', 'View wallet')}
          </PressableButton>
          <PressableButton variant="ghost" size="cta" onClick={() => close(false)}>
            {t('transferReceived.modal.gotIt', 'Got it')}
          </PressableButton>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-success">
          <FiArrowDownLeft className="h-7 w-7" />
        </span>

        {single ? (
          <p className="text-sm text-black/70">
            {t('transferReceived.modal.single', '{{name}} sent you', { name: single.params.name })}
          </p>
        ) : (
          <p className="text-sm text-black/70">
            {t('transferReceived.modal.several', 'You received {{count}} payments while you were away.', {
              count: shown.length,
            })}
          </p>
        )}

        <p className="text-3xl font-bold">+{formatTokenPrecise(total, 2)} USDC</p>

        {!single && (
          <ul className="w-full divide-y divide-black/10 rounded-xl border border-black/10 bg-white text-sm">
            {shown.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate">{n.params.name}</span>
                <span className="shrink-0 font-semibold">+{formatTokenPrecise(amountOf(n), 2)} USDC</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-black/50">{t('transferReceived.modal.inBalance', 'It is already in your balance.')}</p>
      </div>
    </AppModal>
  );
}
