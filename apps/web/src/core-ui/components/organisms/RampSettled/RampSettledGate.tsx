'use client';

import { supportEmail } from '@/core-ui/config/featureFlags';
import { listOpenWithdrawals, markWithdrawalTerminal, type OpenWithdrawal } from '@/networks/pollar/offrampApi';
import { listOpenPurchases, markPurchaseTerminal, type OpenPurchase } from '@/networks/pollar/onrampApi';
import { openAfterCheck, settledOnReopen, shouldKeepWatching } from '@/networks/pollar/rampReopen';
import { useRampOnramp } from '@/networks/pollar/rampsOnramp';
import { Spinner } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowDownLeft, FiArrowUpRight } from 'react-icons/fi';
import { formatTokenPrecise } from '../../../helpers/numbers';
import { useInvalidateAfterMoneyMove, useMarkNotificationRead, useNotifications } from '../../../hooks';
import {
  addRampSettledItems,
  claimRampCheck,
  clearRampPending,
  clearRampSettledItems,
  finishRampCheck,
  isRampCheckRunning,
  markRampPendingShown,
  raiseRampPending,
  setRampCheckRunning,
  setRampOpenRows,
  useAutoModalSlot,
  useRampActiveStore,
  useRampNewsStore,
  type RampSettledItem,
} from '../../../stores';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

const MESSAGE_KEYS = new Set(['onrampSettled', 'offrampSettled']);
/** How long the check waits on the ledger for a purchase's credited USDC. */
const CREDIT_WAIT_MS = 8_000;
/** How often to ask again while a row is open. */
const POLL_MS = 30_000;

/**
 * What happened to the bank purchases and withdrawals the server still has open.
 *
 * Paying a bank QR means leaving for the bank app, and ramp rows only move from
 * this browser, so a purchase paid out there stays open on the server until
 * someone looks. This asks the provider about the user's recent open purchases
 * and withdrawals — once when the app opens, then every {@link POLL_MS} while a
 * row is still open, and immediately whenever the tab comes back, which is the
 * moment the answer is most likely to have changed.
 *
 * A completed row is closed as settled — which is what writes the in-app
 * notification and sends the push — and announced here. A deposit the provider
 * has not credited yet gets the "still in process" notice once per load, so the
 * user is not left thinking their money vanished.
 *
 * None of that is component state. Everything this gate learns lives in
 * {@link useRampNewsStore}, because the gate is remounted more often than it
 * looks: the legal and onboarding gates above it decide from the persisted query
 * cache, then decide again when their refetch lands, swapping the private tree
 * out in between. Fresh state there means the news is either repeated or, for a
 * row this gate already closed on the server, lost.
 */
export function RampSettledGate() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { wallet, getClient } = usePollar();
  const { readCreditedUsdc } = useRampOnramp();
  const invalidateMoney = useInvalidateAfterMoneyMove();
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const isRampActive = useRampActiveStore((state) => state.isRampActive);
  const walletAddress = wallet?.address ?? null;

  const checked = useRampNewsStore((state) => state.checked);
  const settledItems = useRampNewsStore((state) => state.items);
  const openRows = useRampNewsStore((state) => state.openRows);
  const pending = useRampNewsStore((state) => state.pending);
  const pendingShown = useRampNewsStore((state) => state.pendingShown);

  const runCheck = useCallback(
    async (address: string, first: boolean) => {
      // One check at a time, and a check is never cancelled: it closes rows on
      // the server, so dropping its answer would lose the modal for good.
      if (isRampCheckRunning()) return;
      setRampCheckRunning(true);
      let succeeded = false;

      const readStatuses = async (txIds: string[]) => {
        const entries = await Promise.all(
          txIds.map(async (txId) => {
            try {
              const tx = await getClient().getRampTransaction(txId);
              return [txId, { status: tx.status as string, hash: tx.stellarTxHash ?? null }] as const;
            } catch {
              return [txId, null] as const;
            }
          }),
        );
        return new Map(entries);
      };

      try {
        const [purchases, withdrawals] = await Promise.all([listOpenPurchases(address), listOpenWithdrawals(address)]);
        const txIds = [...purchases, ...withdrawals].map((r) => r.providerTxId).filter(Boolean);
        const reads = txIds.length ? await readStatuses(txIds) : new Map();
        const statuses = new Map([...reads].map(([txId, read]) => [txId, read?.status ?? null]));

        const settledPurchases = settledOnReopen<OpenPurchase>(purchases, statuses);
        const settledWithdrawals = settledOnReopen<OpenWithdrawal>(withdrawals, statuses);

        const items = await Promise.all([
          ...settledPurchases.map(async (p): Promise<RampSettledItem> => {
            const hash = reads.get(p.providerTxId)?.hash ?? null;
            const usdc = hash ? await readCreditedUsdc(hash, address, { timeoutMs: CREDIT_WAIT_MS }).catch(() => null) : null;
            await markPurchaseTerminal(address, p.id, 'settled', null, usdc).catch(() => false);
            return { kind: 'onramp', id: p.id, amountFiat: Number(p.amountFiat), currency: p.currency, usdc };
          }),
          ...settledWithdrawals.map(async (w): Promise<RampSettledItem> => {
            await markWithdrawalTerminal(address, w.id, 'settled');
            return { kind: 'offramp', id: w.id, amountFiat: Number(w.amountFiat), currency: w.currency, usdc: null };
          }),
        ]);

        if (items.length) {
          void invalidateMoney();
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          addRampSettledItems(items);
        }

        const openPurchases = openAfterCheck<OpenPurchase>(purchases, statuses);
        setRampOpenRows([...openPurchases, ...openAfterCheck<OpenWithdrawal>(withdrawals, statuses)]);

        // Only the first check raises the notice: after that the user has been
        // told, and what is worth interrupting them for again is the deposit
        // landing. Withdrawals stay silent, as they were.
        const stillOpen = openPurchases[0];
        if (first && !items.length && stillOpen) {
          raiseRampPending({ amountFiat: Number(stillOpen.amountFiat), currency: stillOpen.currency });
        }
        succeeded = true;
      } catch {
        // A check we could not finish says nothing; the next one tries again.
      } finally {
        setRampCheckRunning(false);
        finishRampCheck(succeeded);
      }
    },
    [getClient, readCreditedUsdc, invalidateMoney, queryClient],
  );

  useEffect(() => {
    if (!walletAddress || !claimRampCheck(walletAddress)) return;
    void runCheck(walletAddress, true);
  }, [walletAddress, runCheck]);

  const watching = !!walletAddress && checked && shouldKeepWatching(openRows, new Date());

  useEffect(() => {
    if (!walletAddress || !watching) return;

    const tick = () => {
      // Nothing while the tab is hidden, and nothing while the deposit modal is
      // up: it polls the same transaction itself, and neither modal here may
      // open behind it.
      if (isRampCheckRunning() || isRampActive || document.visibilityState === 'hidden') return;
      void runCheck(walletAddress, false);
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [walletAddress, watching, isRampActive, runCheck]);

  const showSettled = settledItems.length > 0;
  const showPending = !showSettled && pending !== null;
  const onScreen = !isRampActive && (showSettled || showPending);
  // No wallet yet means nothing to check, and nothing to hold the queue for.
  // News the deposit sheet is merely covering still holds it, though: released
  // there, the next auto-modal opens and this one pops up over it afterwards.
  const settled = !walletAddress || (checked && !showSettled && !showPending);
  const isMyTurn = useAutoModalSlot('ramp-settled', settled);

  // The notice is news, and news is delivered once. Everything above decides
  // whether it renders and can flip back — the queue turn, the deposit sheet, a
  // gate swapping the tree — and it is mounted rather than opened, so a return
  // replays the entering animation and reads as a second pop-up.
  const showingPending = isMyTurn && onScreen && showPending;
  useEffect(() => {
    if (showingPending) markRampPendingShown();
    else if (pendingShown) clearRampPending();
  }, [showingPending, pendingShown]);

  if (!isMyTurn || !onScreen) return null;

  const fiat = (amount: number, currency: string) => `${formatTokenPrecise(amount, 2)} ${currency}`;

  if (showPending && pending) {
    return (
      <AppModal
        open
        onOpenChange={() => clearRampPending()}
        title={t('rampSettled.pending.title', 'Your deposit is still being processed')}
        size="sm"
        footer={
          <PressableButton variant="primary" size="cta" onClick={() => clearRampPending()}>
            {t('rampSettled.modal.gotIt', 'Got it')}
          </PressableButton>
        }
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-white">
            <Spinner size="sm" color="current" />
          </span>
          <p className="text-sm text-black/70">
            {t('rampSettled.pending.body', 'We are still waiting for your {{amount}} payment to be confirmed.', {
              amount: fiat(pending.amountFiat, pending.currency),
            })}
          </p>
          <p className="text-[11px] text-gray-400">
            {t(
              'wallet.fiat.onramp.processingHelp',
              "If it hasn't arrived after 15 minutes, keep your bank receipt and write to us:",
            )}{' '}
            <a href={`mailto:${supportEmail()}`} className="font-semibold text-primary">
              {supportEmail()}
            </a>
          </p>
        </div>
      </AppModal>
    );
  }

  const close = () => {
    clearRampSettledItems();
    clearRampPending();
    // Best effort: the notifications written by these closes are the same news,
    // so they are marked read when the feed already has them.
    for (const n of data?.notifications ?? []) {
      if (!n.read && MESSAGE_KEYS.has(n.messageKey)) markRead.mutate(n.id);
    }
  };

  const single = settledItems.length === 1 ? settledItems[0]! : null;
  const headline = (item: RampSettledItem) =>
    item.kind === 'onramp' && item.usdc != null
      ? `+${formatTokenPrecise(item.usdc, 2)} USDC`
      : fiat(item.amountFiat, item.currency);

  const title = single
    ? single.kind === 'onramp'
      ? t('rampSettled.modal.titleDeposit', 'Your deposit is complete')
      : t('rampSettled.modal.titleWithdrawal', 'Your withdrawal is complete')
    : t('rampSettled.modal.titleSeveral', 'Your bank transactions are complete');

  return (
    <AppModal
      open
      onOpenChange={close}
      title={title}
      size="sm"
      footer={
        <PressableButton variant="primary" size="cta" onClick={close}>
          {t('rampSettled.modal.gotIt', 'Got it')}
        </PressableButton>
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-success">
          {single?.kind === 'offramp' ? <FiArrowUpRight className="h-7 w-7" /> : <FiArrowDownLeft className="h-7 w-7" />}
        </span>

        {single ? (
          <>
            <p className="text-3xl font-bold">{headline(single)}</p>
            <p className="text-sm text-black/70">
              {single.kind === 'onramp'
                ? single.usdc != null
                  ? t('rampSettled.modal.paid', 'You paid {{amount}}', {
                      amount: fiat(single.amountFiat, single.currency),
                    })
                  : t('rampSettled.modal.inBalance', 'It is already in your balance.')
                : t('rampSettled.modal.sentToBank', 'Sent to your bank account.')}
            </p>
          </>
        ) : (
          <ul className="w-full divide-y divide-black/10 rounded-xl border border-black/10 bg-white text-sm">
            {settledItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate">
                  {item.kind === 'onramp'
                    ? t('rampSettled.modal.deposit', 'Deposit')
                    : t('rampSettled.modal.withdrawal', 'Withdrawal')}
                </span>
                <span className="shrink-0 font-semibold">{headline(item)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppModal>
  );
}
