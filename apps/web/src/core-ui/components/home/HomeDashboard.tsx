'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { formatTokenPrecise } from '@/core-ui/helpers/numbers';
import { type EarningsPeriod, useDefiEarnings, useDepositsComplete, usePassiveUsdc } from '@/core-ui/hooks';
import { maskAmount, useConfigStore, useHideBalance } from '@/core-ui/stores';
import { Spinner } from '@heroui/react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiTrendingUp, FiUsers } from 'react-icons/fi';
import { BalanceEye } from '../molecules/BalanceEye';
import { SegmentedTabs } from '../molecules/SegmentedTabs';
import { DepositEarnings, DepositEarningsReporter } from './DepositEarningsReporter';
import { AccrualTerm, LiveBalance } from './LiveBalance';

const PERIODS: EarningsPeriod[] = ['daily', 'monthly', 'yearly'];

/** "26", "oct", "2026": the label under each bar, in the user's language. */
function barLabel(start: string, period: EarningsPeriod, language: string): string {
  const date = new Date(start);
  // Seven bars share a narrow strip: the day number alone, the month is in the note.
  if (period === 'daily') return String(date.getDate());
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
      <section className="flex min-h-0 flex-1 flex-col gap-3 py-2">
        {earnings.data && (
          <p className="text-right text-xs font-semibold text-[#018222]">
            {t('dashboard.earnedTotal', '{{amount}} so far', {
              amount: maskAmount(money(earnings.data.totalEarned), hideBalance),
            })}
          </p>
        )}
        {earnings.isPending ? (
          <div className="flex min-h-[15rem] flex-1 items-center justify-center">
            <Spinner size="lg" color="current" />
          </div>
        ) : earnings.isError ? (
          <p className="flex min-h-[15rem] flex-1 items-center justify-center text-center text-xs text-gray-500">
            {t('dashboard.earningsFailed', 'We could not read your earnings. Pull to refresh.')}
          </p>
        ) : (
          <div
            ref={stripRef}
            className="-mx-4 flex min-h-[15rem] flex-1 snap-x snap-mandatory items-end gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {bars.map((bar) => {
              const height = max > 0 ? Math.max(4, (bar.earned / max) * 85) : 4;
              return (
                <div key={bar.start} className="flex h-full w-11 shrink-0 snap-end flex-col items-center gap-1">
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

      {/* Invite: the screen already exists under Profile. */}
      <Link
        href="/profile/invite"
        className="flex items-center gap-3 rounded-lg border border-black border-b-2 bg-[#262626] px-4 py-4 text-white transition active:translate-y-0.5"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
          <FiUsers className="h-5 w-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-bold">{t('dashboard.invite.title', 'Invite and earn')}</span>
          <span className="text-xs text-white/70">{t('dashboard.invite.body', 'Your friends save, your APY grows.')}</span>
        </span>
        <FiChevronRight className="h-5 w-5 shrink-0 text-white/70" />
      </Link>
    </div>
  );
}
