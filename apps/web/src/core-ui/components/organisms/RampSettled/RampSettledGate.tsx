'use client';

import { listOpenWithdrawals, markWithdrawalTerminal, type OpenWithdrawal } from '@/networks/pollar/offrampApi';
import { listOpenPurchases, markPurchaseTerminal, type OpenPurchase } from '@/networks/pollar/onrampApi';
import { settledOnReopen } from '@/networks/pollar/rampReopen';
import { useRampOnramp } from '@/networks/pollar/rampsOnramp';
import { usePollar } from '@pollar/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowDownLeft, FiArrowUpRight } from 'react-icons/fi';
import { formatTokenPrecise } from '../../../helpers/numbers';
import { useInvalidateAfterMoneyMove, useMarkNotificationRead, useNotifications } from '../../../hooks';
import { useAutoModalSlot } from '../../../stores';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

const WALLET_ROUTE = '/profile/wallet';
const MESSAGE_KEYS = new Set(['onrampSettled', 'offrampSettled']);
/** How long the check waits on the ledger for a purchase's credited USDC. */
const CREDIT_WAIT_MS = 8_000;

interface SettledItem {
  kind: 'onramp' | 'offramp';
  id: string;
  amountFiat: number;
  currency: string;
  /** Credited USDC of a purchase, when the ledger said it in time. */
  usdc: number | null;
}

/**
 * "Your deposit / withdrawal is complete", for one that finished while the app
 * was closed.
 *
 * Paying a bank QR means leaving for the bank app, and ramp rows only move from
 * this browser, so a purchase paid out there stays open on the server until
 * someone looks. Once per load this asks the provider about the user's recent
 * open purchases and withdrawals. A completed one is closed as settled — which
 * is what writes the in-app notification and sends the push — and shown here.
 * Anything still pending is left alone until the next load.
 */
export function RampSettledGate() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { wallet, getClient } = usePollar();
  const { readCreditedUsdc } = useRampOnramp();
  const invalidateMoney = useInvalidateAfterMoneyMove();
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const walletAddress = wallet?.address ?? null;

  const started = useRef<string | null>(null);
  const [found, setFound] = useState<SettledItem[] | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!walletAddress || started.current === walletAddress) return;
    // One run per wallet, and it is never cancelled: it closes rows on the
    // server, so dropping its answer would lose the modal for good.
    started.current = walletAddress;

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

    void (async () => {
      const [purchases, withdrawals] = await Promise.all([
        listOpenPurchases(walletAddress),
        listOpenWithdrawals(walletAddress),
      ]);
      const txIds = [...purchases, ...withdrawals].map((r) => r.providerTxId).filter(Boolean);
      const reads = txIds.length ? await readStatuses(txIds) : new Map();
      const statuses = new Map([...reads].map(([txId, read]) => [txId, read?.status ?? null]));

      const settledPurchases = settledOnReopen<OpenPurchase>(purchases, statuses);
      const settledWithdrawals = settledOnReopen<OpenWithdrawal>(withdrawals, statuses);

      const items = await Promise.all([
        ...settledPurchases.map(async (p): Promise<SettledItem> => {
          const hash = reads.get(p.providerTxId)?.hash ?? null;
          const usdc = hash
            ? await readCreditedUsdc(hash, walletAddress, { timeoutMs: CREDIT_WAIT_MS }).catch(() => null)
            : null;
          await markPurchaseTerminal(walletAddress, p.id, 'settled', null, usdc).catch(() => false);
          return { kind: 'onramp', id: p.id, amountFiat: Number(p.amountFiat), currency: p.currency, usdc };
        }),
        ...settledWithdrawals.map(async (w): Promise<SettledItem> => {
          await markWithdrawalTerminal(walletAddress, w.id, 'settled');
          return { kind: 'offramp', id: w.id, amountFiat: Number(w.amountFiat), currency: w.currency, usdc: null };
        }),
      ]);

      if (items.length) {
        void invalidateMoney();
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
      setFound(items);
    })().catch(() => setFound([]));
  }, [walletAddress, getClient, readCreditedUsdc, invalidateMoney, queryClient]);

  // No wallet yet means nothing to check, and nothing to hold the queue for.
  const settled = done || !walletAddress || (found !== null && found.length === 0);
  const isMyTurn = useAutoModalSlot('ramp-settled', settled);

  if (!isMyTurn || done || !found?.length) return null;

  const close = (goToWallet: boolean) => {
    setDone(true);
    // Best effort: the notifications written by these closes are the same news,
    // so they are marked read when the feed already has them.
    for (const n of data?.notifications ?? []) {
      if (!n.read && MESSAGE_KEYS.has(n.messageKey)) markRead.mutate(n.id);
    }
    if (goToWallet) router.push(WALLET_ROUTE);
  };

  const single = found.length === 1 ? found[0]! : null;
  const fiat = (item: SettledItem) => `${formatTokenPrecise(item.amountFiat, 2)} ${item.currency}`;
  const headline = (item: SettledItem) =>
    item.kind === 'onramp' && item.usdc != null ? `+${formatTokenPrecise(item.usdc, 2)} USDC` : fiat(item);

  const title = single
    ? single.kind === 'onramp'
      ? t('rampSettled.modal.titleDeposit', 'Your deposit is complete')
      : t('rampSettled.modal.titleWithdrawal', 'Your withdrawal is complete')
    : t('rampSettled.modal.titleSeveral', 'Your bank transactions are complete');

  return (
    <AppModal
      open
      onOpenChange={() => close(false)}
      title={title}
      size="sm"
      footer={
        <div className="flex w-full flex-col gap-2">
          <PressableButton variant="primary" size="cta" onClick={() => close(true)}>
            {t('rampSettled.modal.viewWallet', 'View wallet')}
          </PressableButton>
          <PressableButton variant="ghost" size="cta" onClick={() => close(false)}>
            {t('rampSettled.modal.gotIt', 'Got it')}
          </PressableButton>
        </div>
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
                  ? t('rampSettled.modal.paid', 'You paid {{amount}}', { amount: fiat(single) })
                  : t('rampSettled.modal.inBalance', 'It is already in your balance.')
                : t('rampSettled.modal.sentToBank', 'Sent to your bank account.')}
            </p>
          </>
        ) : (
          <ul className="w-full divide-y divide-black/10 rounded-xl border border-black/10 bg-white text-sm">
            {found.map((item) => (
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
