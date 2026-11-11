'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { formatTokenPrecise } from '@/core-ui/helpers/numbers';
import {
  EARNINGS_BARS,
  EarningsUnavailableError,
  type EarningsPeriod,
  useDefiEarnings,
  useDepositsComplete,
  usePassiveUsdc,
  useRecentActivity,
} from '@/core-ui/hooks';
import { maskAmount, useConfigStore, useHideBalance } from '@/core-ui/stores';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type PointerEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrendingUp } from 'react-icons/fi';
import { ActivityRow } from '../molecules/ActivityRow';
import { BalanceEye } from '../molecules/BalanceEye';
import { SegmentedTabs } from '../molecules/SegmentedTabs';
import { TransactionList, TransactionRowSkeleton } from '../molecules/TransactionRow';
import { DepositEarnings, DepositEarningsReporter } from './DepositEarningsReporter';
import { EarningsBarsSkeleton, EarningsTotalSkeleton } from './HomeSkeleton';
import { AccrualTerm, formatLiveBalance, LiveBalance } from './LiveBalance';

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
  // The card opens the portfolio page.
  const openPortfolio = () => router.push('/portafolio');
  const hideBalance = useHideBalance();
  const [period, setPeriod] = useState<EarningsPeriod>('daily');

  const { data: depositsData } = useDepositsComplete(walletAddress);
  const { activeDeposits, activeDepositsTotalAmount } = getDepositsData(depositsData?.deposits ?? []);
  const {
    apy: passiveApy,
    ratePerMs: passiveRatePerMs,
    updatedAt: passiveUpdatedAt,
    settled: passiveSettled,
    hasBalance: passiveReady,
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
  // Every digit of the figure shares one size, so that size has to give way
  // when the figure would not fit beside the eye: 30px at most, less on a
  // narrow phone or with a long whole part. The figure is measured in digit
  // widths (the dollar sign, the whole part, the eight decimals, and about
  // half a digit for the dot and each comma), a digit being 0.62em wide; the
  // 2rem set aside is the eye and its gap. `cqw` is the width of the column.
  const wholeDigits = String(Math.floor(balanceBase)).length;
  const balanceUnits = 7.5 + wholeDigits + (Math.floor((wholeDigits - 1) / 3) + 1) * 0.45;
  const balanceFontSize = `min(1.625rem, calc((100cqw - 2rem) / ${(balanceUnits * 0.62).toFixed(2)}))`;
  // The figure's shape with nothing of its value: every digit a zero. What the
  // hidden balance is drawn over, so it is as wide and as long as the real one.
  const { big: maskBig, sub: maskSub } = formatLiveBalance(balanceBase, 8);
  const balanceMask = (maskBig + maskSub).replace(/\d/g, '0');
  const maskBigZeros = maskBig.replace(/\d/g, '0');
  const maskSubZeros = maskSub.replace(/\d/g, '0');
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

  // The strip opens on its latest bars and scrolls back into the past.
  // A layout effect, not a plain one: it has to park the strip on today BEFORE
  // the first paint. After it, one frame showed the oldest six bars (shorter,
  // scaled against the latest ones) and the next jumped to today, which read
  // as the bars growing every time the screen was opened with its data cached.
  const stripRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const barsKey = bars.length ? `${period}:${bars[bars.length - 1]!.key}` : '';
  useLayoutEffect(() => {
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
    // The scroll is the whole screen (its bar stays on the edge); the board is
    // one column as wide as the header above it (max-w-xl), so on a desktop it
    // stays the size of a tablet instead of stretching to the window.
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-4 pb-6 pt-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
        {activeDeposits.map((d) => (
          <DepositEarningsReporter key={d.id} deposit={d} onReport={reportEarnings} />
        ))}

        {/* The money at work, live, and at what pace it grows. The whole card
            opens the portfolio: the button is a layer over it, not a wrapper,
            because the eye inside is a button too and one cannot nest in another. */}
        <section className="relative flex items-center gap-3 rounded-lg border border-black border-b-5 bg-white px-4 py-4 transition has-[>button:active]:translate-y-[3px] has-[>button:active]:border-b-2">
          <button
            type="button"
            onClick={openPortfolio}
            aria-label={t('home.stats.apyAria', 'Portfolio')}
            className="peer absolute inset-0 rounded-lg"
          />
          {/* `pointer-events-none`: being a container puts this column in a layer
              of its own, above the card's button, and it would swallow the tap. */}
          <div className="pointer-events-none flex min-w-0 flex-1 flex-col gap-1 [container-type:inline-size]">
            <div className="flex items-center gap-2">
              {/* The six digits that tick go lighter and at 3/4 the size. */}
              <span
                className="whitespace-nowrap font-bold leading-8 text-black tabular-nums"
                style={{ fontSize: balanceFontSize }}
              >
                {!passiveReady ? (
                  // No reading yet, including the one restored from the last
                  // visit. A zero here is what a reload showed for a second
                  // before the vault simulation came back.
                  <span className="inline-block h-8 w-40 rounded bg-black/10 animate-pulse" />
                ) : hideBalance ? (
                  // A dot per character of the figure, spread over the exact
                  // width it takes: the zeros hold that width unseen (tabular
                  // digits are all as wide), so the eye stays where it was.
                  <span aria-hidden className="relative inline-block">
                    <span className="invisible">
                      {maskBigZeros}
                      <span className="text-[0.75em]">{maskSubZeros}</span>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-around">
                      {Array.from(balanceMask, (_, i) => (
                        <span key={i} className="h-[0.3em] w-[0.3em] rounded-full bg-black" />
                      ))}
                    </span>
                  </span>
                ) : (
                  <LiveBalance
                    base={balanceBase}
                    terms={terms}
                    decimals={8}
                    bigClassName=""
                    subClassName="text-[0.75em] text-black/40"
                  />
                )}
              </span>
              {/* The app's global hide-money switch, beside the money it hides.
                  The one thing in the column that takes taps, with a wider touch
                  area than its icon: a miss here would open the portfolio instead. */}
              <BalanceEye className="pointer-events-auto relative after:absolute after:-inset-2 after:content-['']" />
            </div>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
              {!passiveReady ? (
                <span className="inline-block h-4 w-36 rounded bg-black/10 animate-pulse" />
              ) : (
                <>
                  <span className="flex items-center gap-1 text-[#018222]">
                    <FiTrendingUp className="h-4 w-4" />
                    {t('dashboard.apy', '{{apy}}% APY', { apy: passiveApy.toFixed(2) })}
                  </span>
                  <span className="text-gray-500">
                    {t('dashboard.perDay', '{{amount}} per day', { amount: maskAmount(money(perDay), hideBalance) })}
                  </span>
                </>
              )}
            </span>
          </div>
        </section>

        {/* Withdraw and deposit, right under the money they move. */}
        {actions}

        {/* What the flexible savings earned: a bar per day, month or year, the
            latest on the right, and earlier ones by swiping left. No card around
            it: the strip runs edge to edge so there is nothing to bump into. */}
        <section className="flex flex-col gap-3 py-2">
          {/* The total keeps its line whether or not there is a figure to put in
              it: showing up with the data, it pushed the bars down. */}
          {earnings.isPending ? (
            <EarningsTotalSkeleton />
          ) : (
            <p className="h-4 text-right text-xs font-semibold text-[#018222]">
              {earnings.data && earnings.data.totalEarned > 0
                ? t('dashboard.earnedTotal', '{{amount}} so far', {
                    amount: maskAmount(money(earnings.data.totalEarned), hideBalance),
                  })
                : null}
            </p>
          )}
          {earnings.isPending ? (
            // The same bars the boot skeleton draws (<HomeSkeleton>), so the
            // chart loads in place instead of a spinner the bars then pop out of.
            <div role="status" aria-busy="true">
              <EarningsBarsSkeleton />
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
                              : 'border-black border-b-2 bg-success/40')
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
            <TransactionList align="grouped">
              {activity.data.map((item) => (
                // Straight to the movement's own page, not through the list.
                <ActivityRow
                  key={item.id}
                  item={item}
                  hideBalance={hideBalance}
                  onPress={() => router.push(`/transactions/${item.id}`)}
                />
              ))}
            </TransactionList>
          )}
        </section>

        {/* Hidden for now (2026-10-31): the invite card. The screen it opened,
            /profile/invite, still exists. Markup kept here to bring it back:
            <Link href="/profile/invite" ...> FiUsers + dashboard.invite.title / .body </Link> */}
      </div>
    </div>
  );
}
