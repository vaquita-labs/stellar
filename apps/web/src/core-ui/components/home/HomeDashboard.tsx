'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { formatTokenPrecise } from '@/core-ui/helpers/numbers';
import {
  type ActivityItem,
  EARNINGS_BARS,
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
import { type PointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/** Bars the strip shows at once; the rest are a swipe away. */
const VISIBLE_BARS = 6;
/** Years drawn after the current one, so "this year" sits mid-strip with what is still to come beside it. */
const FUTURE_YEARS = 3;
/** The first year the yearly strip draws: nothing was saved before it, so earlier years are not offered. */
const FIRST_YEAR = 2024;
/** How long the scroll bar under the strip stays after the last movement, in ms. */
const SCROLL_HINT_MS = 900;
/** The tallest bar in view, as a share of the column: the rest is the figure above it. */
const FULL_BAR = 90;

interface ChartBar {
  key: string;
  label: string;
  earned: number;
  estimated: boolean;
  /** Nothing earned in it (or it has not happened yet): drawn as an outline, without a figure. */
  ghost: boolean;
}

/** A steady height (30–75%) for a bar with nothing in it, so the outlines read as a skyline and never jump between renders. */
function ghostHeight(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  hash ^= hash >>> 15;
  return 30 + ((hash >>> 0) % 46);
}

/** The calendar buckets a period would bring, ending on today: what the strip draws while there is nothing earned to show. */
function emptyBuckets(period: EarningsPeriod): { start: string; earned: number; estimated: boolean }[] {
  const now = new Date();
  const count = EARNINGS_BARS[period];
  return Array.from({ length: count }, (_, i) => {
    const back = count - 1 - i;
    const start =
      period === 'daily'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
        : period === 'monthly'
          ? new Date(now.getFullYear(), now.getMonth() - back, 1)
          : new Date(now.getFullYear() - back, 0, 1);
    return { start: start.toISOString(), earned: 0, estimated: false };
  });
}

/** Where the strip is, drawn on the bar under it: the thumb is as wide as the share of the bars in view. */
function syncThumb(strip: HTMLElement | null, thumb: HTMLElement | null) {
  if (!strip || !thumb) return;
  const overflow = strip.scrollWidth - strip.clientWidth;
  const share = strip.scrollWidth > 0 ? Math.min(1, strip.clientWidth / strip.scrollWidth) : 1;
  thumb.style.width = `${share * 100}%`;
  thumb.style.left = `${overflow > 0 ? (strip.scrollLeft / overflow) * (1 - share) * 100 : 0}%`;
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
  const buckets = earnings.data?.buckets;
  const pending = earnings.isPending;
  const language = i18n.language;
  const bars = useMemo<ChartBar[]>(() => {
    // No reading at all (nothing saved yet, or no earnings route): the same
    // calendar, empty, so the strip still shows its outlines instead of a void.
    // Not while the reading is on its way: the strip is not on screen then,
    // and its bars must arrive with it so it opens parked on today.
    const all = buckets?.length ? buckets : pending ? [] : emptyBuckets(period);
    const source = period === 'yearly' ? all.filter((b) => new Date(b.start).getFullYear() >= FIRST_YEAR) : all;
    const list = source.map<ChartBar>((b) => ({
      key: b.start,
      label: barLabel(b.start, period, language),
      earned: b.earned,
      estimated: b.estimated,
      ghost: b.earned <= 0,
    }));
    // By year the strip does not end on today: the years still to come follow
    // as outlines, which leaves the current one in the middle of the six.
    const last = source[source.length - 1];
    if (period === 'yearly' && last) {
      const year = new Date(last.start).getFullYear();
      for (let i = 1; i <= FUTURE_YEARS; i++) {
        list.push({ key: `future-${year + i}`, label: String(year + i), earned: 0, estimated: false, ghost: true });
      }
    }
    return list;
  }, [buckets, pending, period, language]);
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
        {/* Capped and truncated: whatever the record brings as amount or asset,
            this column can never push the title out or widen the card. */}
        <div className="min-w-0 max-w-[60%] shrink-0 text-right">
          {item.amount !== null && (
            <p className={`truncate text-[13px] font-bold tabular-nums ${green ? 'text-success' : 'text-black'}`}>
              {hideBalance ? '••••' : `${meta.sign}${formatTokenPrecise(item.amount, 2)} ${item.asset ?? ''}`.trim()}
            </p>
          )}
          <p className="text-[10px] text-gray-500">{formatTransactionTime(item.timestamp, language)}</p>
        </div>
      </li>
    );
  };

  // The strip opens on its latest bars and scrolls back into the past.
  const stripRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const barsKey = bars.length ? `${period}:${bars[bars.length - 1]!.key}` : '';
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
    syncThumb(el, thumbRef.current);
  }, [barsKey]);

  // The scale belongs to the stretch travelled: from the first bar in view up
  // to the latest one. Parked on today it is set by the last six bars alone,
  // whatever happened before; swiping back brings older bars into the stretch
  // and, when one of them is taller, everything resizes to it.
  // Until the strip reports a scroll for these bars, it is parked at the end.
  const lastWindow = Math.max(0, bars.length - VISIBLE_BARS);
  const [scrolled, setScrolled] = useState({ key: '', first: 0 });
  const firstVisible = scrolled.key === barsKey ? Math.min(scrolled.first, lastWindow) : lastWindow;
  // The bar under the strip behaves like a phone's scroll bar: it shows while
  // the strip moves and fades out once it rests.
  const [scrolling, setScrolling] = useState(false);
  const scrollIdle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(scrollIdle.current), []);
  const onStripScroll = () => {
    const el = stripRef.current;
    if (!el || !bars.length) return;
    syncThumb(el, thumbRef.current);
    setScrolling(true);
    clearTimeout(scrollIdle.current);
    scrollIdle.current = setTimeout(() => setScrolling(false), SCROLL_HINT_MS);
    // One step is a bar plus its gap: the distance between two neighbours.
    const [a, b] = [el.children[0] as HTMLElement | undefined, el.children[1] as HTMLElement | undefined];
    const step = a && b ? b.offsetLeft - a.offsetLeft : el.scrollWidth / bars.length;
    const first = Math.max(0, Math.min(lastWindow, Math.round(el.scrollLeft / step)));
    setScrolled((prev) => (prev.key === barsKey && prev.first === first ? prev : { key: barsKey, first }));
  };
  const max = Math.max(...bars.slice(firstVisible).map((b) => b.earned), 0);
  // With a mouse the bar is a handle too (it shows on hover): pressing or
  // dragging it moves the strip so the thumb ends up under the pointer.
  const seekStrip = (event: PointerEvent<HTMLDivElement>) => {
    const el = stripRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const track = event.currentTarget.getBoundingClientRect();
    const share = el.clientWidth / el.scrollWidth;
    const ratio = ((event.clientX - track.left) / track.width - share / 2) / (1 - share);
    el.scrollLeft = Math.max(0, Math.min(1, ratio)) * (el.scrollWidth - el.clientWidth);
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-y-auto overflow-x-hidden px-4 pb-6 pt-4">
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
        {earnings.data && earnings.data.totalEarned > 0 && (
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
        ) : earnings.isError && !(earnings.error instanceof EarningsUnavailableError) ? (
          <p className="flex h-72 items-center justify-center px-6 text-center text-sm text-gray-500">
            {t('dashboard.earningsFailed', 'We could not read your earnings. Pull to refresh.')}
          </p>
        ) : (
          <div className="relative">
            <div
              ref={stripRef}
              onScroll={onStripScroll}
              // `no-scrollbar`: the global orange scrollbar would sit on top of
              // the labels; the bar below the strip takes its place while it moves.
              className="no-scrollbar flex h-72 snap-x snap-mandatory items-end gap-2 overflow-x-auto"
            >
              {bars.map((bar) => {
                // A bar off screen can be taller than the one that sets the
                // scale: it is capped until it comes into view and takes over.
                const height = bar.ghost ? ghostHeight(bar.key) : Math.max(4, Math.min(1, bar.earned / max) * FULL_BAR);
                return (
                  <div
                    key={bar.key}
                    // Six bars fill the strip exactly (five gaps of 0.5rem), so
                    // none is cut at an edge; earlier ones are a swipe away.
                    className="flex h-full w-[calc((100%-2.5rem)/6)] shrink-0 snap-end flex-col items-center gap-1"
                  >
                    <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
                      {!bar.ghost && (
                        <span className="whitespace-nowrap text-[9px] font-semibold text-black tabular-nums">
                          {hideBalance ? '••' : money(bar.earned)}
                        </span>
                      )}
                      <motion.div
                        initial={false}
                        animate={{ height: `${height}%` }}
                        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                        className={
                          'w-full rounded-md border ' +
                          (bar.ghost
                            ? 'border-dashed border-black/25 bg-black/[0.03]'
                            : 'border-black border-b-2 ' + (bar.estimated ? 'bg-success/40' : 'bg-success'))
                        }
                      />
                    </div>
                    <span className={`whitespace-nowrap text-[10px] ${bar.ghost ? 'text-gray-400' : 'text-gray-500'}`}>
                      {bar.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Where the strip is, clear of the labels and out of the layout
                (it floats in the gap above the tabs): a thumb as wide as the
                bars in view, there only while the strip moves. */}
            {bars.length > VISIBLE_BARS && (
              <div
                aria-hidden
                onPointerDown={(event) => {
                  if (event.pointerType !== 'mouse') return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  seekStrip(event);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) seekStrip(event);
                }}
                className={
                  'absolute inset-x-0 top-full py-[3px] transition-opacity duration-300 hover:opacity-100 ' +
                  (scrolling ? 'opacity-100' : 'opacity-0')
                }
              >
                <div className="relative h-1.5 w-full rounded-full bg-black/10">
                  <div ref={thumbRef} className="absolute inset-y-0 rounded-full border border-black bg-primary" />
                </div>
              </div>
            )}
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
