'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { formatTokenPrecise } from '@/core-ui/helpers/numbers';
import {
  type ActivityItem,
  EarningsUnavailableError,
  type EarningsPeriod,
  useDefiEarnings,
  useDepositsComplete,
  usePassiveUsdc,
  useRecentActivity,
} from '@/core-ui/hooks';
import { maskAmount, useConfigStore, useHideBalance } from '@/core-ui/stores';
import { Spinner } from '@heroui/react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { FiArrowDownLeft, FiArrowUpRight, FiAward, FiChevronRight, FiFileText, FiPocket, FiTrendingUp } from 'react-icons/fi';
import { BalanceEye } from '../molecules/BalanceEye';
import { SegmentedTabs } from '../molecules/SegmentedTabs';
import { formatTransactionTime, TransactionList, TransactionRowSkeleton } from '../molecules/TransactionRow';
import { DepositEarnings, DepositEarningsReporter } from './DepositEarningsReporter';
import { AccrualTerm, LiveBalance } from './LiveBalance';

const PERIODS: EarningsPeriod[] = ['daily', 'monthly', 'yearly'];

/** "26", "oct", "2026": the label under each bar, in the user's language. */
function barLabel(start: string, period: EarningsPeriod, language: string): string {
  const date = new Date(start);
  // Day and short month ("26 oct"): the strip swipes back across months.
  if (period === 'daily') return date.toLocaleDateString(language, { day: 'numeric', month: 'short' }).replace('.', '');
  if (period === 'monthly') return date.toLocaleDateString(language, { month: 'short' });
  return String(date.getFullYear());
}

/** Two decimals, with a third and fourth while the figure is under a cent, so a small projection still shows something. */
const money = (value: number) => `$${formatTokenPrecise(value, value > 0 && value < 0.01 ? 4 : 2)}`;

/**
 * The home without the 3D world: the money at work. The total invested, live
 * (the same figure and the same accrual terms as the header's pill), the
 * passive APY and the daily yield, then what the flexible savings actually
 * earned, per day, month or year, as the server measured it from its balance
 * readings (`useDefiEarnings`), and the invite card. The deposit and withdraw
 * bar stays where it was, under this.
 */
export function HomeDashboard({ actions }: { actions?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { walletAddress } = useConfigStore();
  const router = useRouter();
  // The card opens the portfolio the way the header's pill does: a soft
  // navigation to /portafolio, which the `@modal` slot paints as an overlay
  // (see [[portfolio-overlay-flow]]). Same safety net as the header for a URL
  // already parked on /portafolio with the overlay closed.
  const openPortfolio = () => {
    if (window.location.pathname === '/portafolio') router.push(`/portafolio?r=${Date.now()}`);
    else router.push('/portafolio');
  };
  const hideBalance = useHideBalance();
  const [period, setPeriod] = useState<EarningsPeriod>('daily');

  const { data: depositsData } = useDepositsComplete(walletAddress);
  const { activeDeposits, activeDepositsTotalAmount } = getDepositsData(depositsData?.deposits ?? []);
  const {
    apy: passiveApy,
    ratePerMs: passiveRatePerMs,
    updatedAt: passiveUpdatedAt,
    settled: passiveSettled,
  } = usePassiveUsdc(walletAddress);

  // Each active deposit reports its own rate (its APY is a hook per lock
  // period), the same way the header collects them.
  const [earningsById, setEarningsById] = useState<Record<number, DepositEarnings>>({});
  const reportEarnings = useCallback((id: number, earnings: DepositEarnings) => {
    setEarningsById((prev) => {
      const current = prev[id];
      if (
        current &&
        current.vaquita === earnings.vaquita &&
        current.protocol === earnings.protocol &&
        current.ratePerMs === earnings.ratePerMs
      )
        return prev;
      return { ...prev, [id]: earnings };
    });
  }, []);

  const terms = useMemo<AccrualTerm[]>(() => {
    const list = activeDeposits.flatMap<AccrualTerm>((d) => {
      const earnings = earningsById[d.id];
      if (!earnings) return [];
      const skew = d.serverTimestamp && d.fetchedAtTimestamp ? d.fetchedAtTimestamp - d.serverTimestamp : 0;
      return [{ ratePerMs: earnings.ratePerMs, maxInterest: earnings.maxInterest, anchor: d.createdTimestamp + skew }];
    });
    if (passiveUpdatedAt) list.push({ ratePerMs: passiveRatePerMs, maxInterest: Infinity, anchor: passiveUpdatedAt });
    return list;
  }, [activeDeposits, earningsById, passiveRatePerMs, passiveUpdatedAt]);

  // The still part of the balance; what moves is projected by <LiveBalance>
  // on every tick without re-rendering this screen, like the header does.
  const balanceBase = activeDepositsTotalAmount + passiveSettled;
  const perDay = terms.reduce((sum, term) => sum + term.ratePerMs, 0) * 86_400_000;
  const earnings = useDefiEarnings(period);
  const bars = earnings.data?.buckets ?? [];
  const max = Math.max(...bars.map((b) => b.earned), 0);
  const language = i18n.language;
  const activity = useRecentActivity(3);

  // Money that comes back to the wallet is green with a plus, like the
  // Transactions screen; money that leaves it carries a minus.
  const ACTIVITY: Record<ActivityItem['kind'], { icon: IconType; label: string; sign: '+' | '-' | ''; box: string }> = {
    received: { icon: FiArrowDownLeft, label: t('dashboard.activity.received', 'Received'), sign: '+', box: 'bg-success/25' },
    sent: { icon: FiArrowUpRight, label: t('dashboard.activity.sent', 'Sent'), sign: '-', box: 'bg-primary/30' },
    flexibleIn: {
      icon: FiTrendingUp,
      label: t('dashboard.activity.flexibleIn', 'Into flexible savings'),
      sign: '-',
      box: 'bg-primary/30',
    },
    flexibleOut: {
      icon: FiTrendingUp,
      label: t('dashboard.activity.flexibleOut', 'Out of flexible savings'),
      sign: '+',
      box: 'bg-success/25',
    },
    lockedIn: { icon: FiPocket, label: t('dashboard.activity.lockedIn', 'Saved for a term'), sign: '-', box: 'bg-primary/30' },
    lockedOut: { icon: FiPocket, label: t('dashboard.activity.lockedOut', 'Term withdrawn'), sign: '+', box: 'bg-success/25' },
    badge: { icon: FiAward, label: t('dashboard.activity.badge', 'Badge claimed'), sign: '', box: 'bg-[#FFF7E6]' },
    other: { icon: FiFileText, label: t('dashboard.activity.other', 'Operation'), sign: '', box: 'bg-background' },
  };
  const subtitleOf = (item: ActivityItem) => {
    if (item.kind === 'received') return t('dashboard.activity.from', 'From {{who}}', { who: item.counterparty ?? '' });
    if (item.kind === 'sent') return t('dashboard.activity.to', 'To {{who}}', { who: item.counterparty ?? '' });
    if (item.kind === 'flexibleIn' || item.kind === 'flexibleOut') return t('dashboard.activity.flexible', 'Flexible savings');
    if (item.kind === 'lockedIn' || item.kind === 'lockedOut') return t('dashboard.activity.locked', 'Term savings');
    if (item.kind === 'badge') return t('dashboard.activity.badges', 'Badges');
    return item.summary;
  };
  const activityRow = (item: ActivityItem) => {
    const meta = ACTIVITY[item.kind];
    const Icon = meta.icon;
    const green = meta.sign === '+';
    return (
      <li key={item.id} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-black text-black ${meta.box}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-bold text-black">{item.kind === 'other' ? item.summary : meta.label}</p>
            {item.status !== 'SUCCESS' && (
              <span
                className={
                  'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ' +
                  (item.status === 'PENDING'
                    ? 'border-black/20 bg-primary/20 text-black'
                    : 'border-red-300 bg-red-100 text-red-700')
                }
              >
                {item.status === 'PENDING'
                  ? t('dashboard.activity.pending', 'Pending')
                  : t('dashboard.activity.failedTx', 'Failed')}
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-gray-600">{subtitleOf(item)}</p>
        </div>
        <div className="shrink-0 text-right">
          {item.amount !== null && (
            <p className={`text-[13px] font-bold tabular-nums ${green ? 'text-success' : 'text-black'}`}>
              {hideBalance ? '••••' : `${meta.sign}${formatTokenPrecise(item.amount, 2)} ${item.asset ?? ''}`.trim()}
            </p>
          )}
          <p className="text-[10px] text-gray-500">{formatTransactionTime(item.timestamp, language)}</p>
        </div>
      </li>
    );
  };

  // The strip opens on today and scrolls back into the past.
  const stripRef = useRef<HTMLDivElement>(null);
  const barsKey = bars.length ? `${period}:${bars[bars.length - 1]!.start}` : '';
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [barsKey]);

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-y-auto px-4 pb-6 pt-4">
      {activeDeposits.map((d) => (
        <DepositEarningsReporter key={d.id} deposit={d} onReport={reportEarnings} />
      ))}

      {/* The money at work, live, and at what pace it grows. The figure opens
          the portfolio; the eye beside the label is the app's global hide-money
          switch, the same one as in Settings. */}
      <section className="flex items-center gap-2 rounded-lg border border-black border-b-2 bg-white px-4 py-4">
        <button
          type="button"
          onClick={openPortfolio}
          aria-label={t('home.stats.apyAria', 'Portfolio')}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left transition active:translate-y-0.5"
        >
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-bold text-black tabular-nums">
              {hideBalance ? (
                <span className="text-4xl">••••</span>
              ) : (
                // Eight decimals: the two of the cents, big, and six small ones that tick.
                <LiveBalance
                  base={balanceBase}
                  terms={terms}
                  decimals={8}
                  bigClassName="text-4xl"
                  subClassName="text-base text-black/40"
                />
              )}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
              <span className="flex items-center gap-1 text-[#018222]">
                <FiTrendingUp className="h-4 w-4" />
                {t('dashboard.apy', '{{apy}}% APY', { apy: passiveApy.toFixed(2) })}
              </span>
              <span className="text-gray-500">
                {t('dashboard.perDay', '{{amount}} per day', { amount: maskAmount(money(perDay), hideBalance) })}
              </span>
            </span>
          </span>
          <FiChevronRight aria-hidden className="h-5 w-5 shrink-0 text-black/50" />
        </button>
        {/* The app's global hide-money switch, beside the money it hides. */}
        <BalanceEye />
      </section>

      {/* Withdraw and deposit, right under the money they move. */}
      {actions}

      {/* What the flexible savings earned: a bar per day, month or year, the
          latest on the right, and earlier ones by swiping left. No card around
          it: the strip runs edge to edge so there is nothing to bump into. */}
      <section className="flex flex-col gap-3 py-2">
        {earnings.data && (
          <p className="text-right text-xs font-semibold text-[#018222]">
            {t('dashboard.earnedTotal', '{{amount}} so far', {
              amount: maskAmount(money(earnings.data.totalEarned), hideBalance),
            })}
          </p>
        )}
        {earnings.isPending ? (
          <div className="flex h-72 items-center justify-center">
            <Spinner size="lg" color="current" />
          </div>
        ) : earnings.isError ? (
          <p className="flex h-72 items-center justify-center px-6 text-center text-sm text-gray-500">
            {earnings.error instanceof EarningsUnavailableError
              ? t('dashboard.earningsSoon', 'Soon you will see here what your savings earn, day by day.')
              : t('dashboard.earningsFailed', 'We could not read your earnings. Pull to refresh.')}
          </p>
        ) : (
          <div
            ref={stripRef}
            className="flex h-72 snap-x snap-mandatory items-end gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {bars.map((bar) => {
              const height = max > 0 ? Math.max(4, (bar.earned / max) * 85) : 4;
              return (
                <div
                  key={bar.start}
                  // Six bars fill the strip exactly (five gaps of 0.5rem), so
                  // none is cut at an edge; earlier ones are a swipe away.
                  className="flex h-full w-[calc((100%-2.5rem)/6)] shrink-0 snap-end flex-col items-center gap-1"
                >
                  <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="whitespace-nowrap text-[9px] font-semibold text-black tabular-nums">
                      {hideBalance ? '••' : money(bar.earned)}
                    </span>
                    <motion.div
                      initial={false}
                      animate={{ height: `${height}%` }}
                      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                      className={
                        'w-full rounded-md border border-black border-b-2 ' +
                        (bar.earned <= 0 ? 'bg-black/10' : bar.estimated ? 'bg-success/40' : 'bg-success')
                      }
                    />
                  </div>
                  <span className="whitespace-nowrap text-[10px] text-gray-500">{barLabel(bar.start, period, language)}</span>
                </div>
              );
            })}
          </div>
        )}
        <SegmentedTabs
          value={period}
          onChange={setPeriod}
          ariaLabel={t('dashboard.periodAria', 'Period')}
          tabs={PERIODS.map((key) => ({ key, label: t(`dashboard.period.${key}`, key) }))}
          compact
        />
      </section>

      {/* The last few movements of the wallet, in the same card the
          Transactions screen uses: payments in and out, money into and out of
          the savings, read from the SDK's on-chain history. */}
      <section className="rounded-2xl bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-black">{t('dashboard.activity.title', 'Latest activity')}</p>
          <Link href="/transactions" className="text-xs font-semibold text-gray-500 underline underline-offset-2">
            {t('dashboard.activity.all', 'See all')}
          </Link>
        </div>
        {activity.isLoading ? (
          <TransactionList align="grouped">
            {[0, 1, 2].map((i) => (
              <TransactionRowSkeleton key={i} />
            ))}
          </TransactionList>
        ) : activity.isError || !activity.data || activity.data.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-500">
            {activity.isError
              ? t('dashboard.activity.failed', 'We could not read your latest activity.')
              : t('dashboard.activity.empty', 'Your movements will show up here.')}
          </p>
        ) : (
          <TransactionList align="grouped">{activity.data.map(activityRow)}</TransactionList>
        )}
      </section>

      {/* Hidden for now (2026-10-31): the invite card. The screen it opened,
          /profile/invite, still exists. Markup kept here to bring it back:
          <Link href="/profile/invite" ...> FiUsers + dashboard.invite.title / .body </Link> */}
    </div>
  );
}
