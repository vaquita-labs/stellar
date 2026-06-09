'use client';

import { ONE_DAY } from '@/core-ui/config/constants';
import { useDepositsComplete } from '@/core-ui/hooks';
import { useProfileExperience, useProfileStreak } from '@/core-ui/hooks/profile';
import { DepositResponseDTO } from '@/core-ui/types';
import Image from 'next/image';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPlus, FiTrendingUp } from 'react-icons/fi';
import { MockedSubPageLayout } from './MockedSubPageLayout';

/* ------------------------------------------------------------------ */
/* Shared shell                                                        */
/* ------------------------------------------------------------------ */

interface PanelProps {
  icon: string;
  title: string;
  subtitle?: string;
  /** Show a small "Soon" pill when the panel is still mocked. */
  soon?: boolean;
  children: React.ReactNode;
}

/**
 * Cream panel with a global icon, a bolded title and an optional tagline.
 * Wraps every metric block so the page reads as a stack of "cards" without
 * needing a heavyweight chart library.
 */
function Panel({ icon, title, subtitle, soon, children }: PanelProps) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl bg-white border border-black border-b-2 p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2.5">
        <Image src={icon} alt={title} width={28} height={28} className="object-contain" />
        <div className="flex flex-col leading-tight flex-1 min-w-0">
          <h2 className="text-sm font-extrabold text-black">{title}</h2>
          {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
        </div>
        {soon && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider bg-primary text-black border border-black border-b-2 rounded-full px-2 py-0.5">
            {t('common.soon')}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

/** Subtle inline placeholder while a panel's query is loading. */
function PanelLoading() {
  return <div className="h-24 w-full rounded-xl bg-black/5 animate-pulse" aria-hidden />;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// Mirror of the backend `getCurrentDay` (packages/shared/src/helpers/date.ts):
// timestamps are bucketed into integer "day-numbers" of ms / ONE_DAY (UTC).
const getDayNumber = (ms: number) => Math.ceil(ms / ONE_DAY);

// Weekday letter (Sun-indexed) for a given day-number, taken at the midpoint of
// its UTC window so it lands squarely inside the day regardless of rounding.
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const weekdayLetter = (dayNumber: number) =>
  WEEKDAY_LETTERS[new Date((dayNumber - 0.5) * ONE_DAY).getUTCDay()];

// Monday 00:00 (local) of the week containing `ms`.
function startOfWeek(ms: number): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const mondayOffset = (d.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  d.setDate(d.getDate() - mondayOffset);
  return d;
}

// Bucket confirmed deposits into the last `WEEKS` ISO weeks (Monday-start),
// summing amounts per week. Weeks with no deposits stay at 0 so the chart keeps
// a stable shape. Labels use the week-start date (e.g. "Apr 7").
const WEEKS = 6;
function buildWeeklyDeposits(deposits: DepositResponseDTO[]) {
  const thisWeek = startOfWeek(Date.now());
  const buckets = Array.from({ length: WEEKS }, (_, i) => {
    const ws = new Date(thisWeek);
    ws.setDate(ws.getDate() - (WEEKS - 1 - i) * 7);
    return {
      start: ws.getTime(),
      week: ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      amount: 0,
    };
  });
  const firstStart = buckets[0].start;

  for (const dep of deposits) {
    const ts = dep.confirmedTimestamp || dep.createdTimestamp || 0;
    if (!ts || ts < firstStart) continue;
    const weekStart = startOfWeek(ts).getTime();
    const bucket = buckets.find((b) => b.start === weekStart);
    if (bucket) bucket.amount += Number(dep.amount) || 0;
  }
  return buckets;
}

// Derive a level + progress from a single total-XP value. The backend only
// exposes aggregated `experience`, so the level curve lives here until it does:
// reaching the next level costs 100 XP, +50 more each level (100, 150, 200 …).
function deriveLevel(totalXp: number) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  let xpForNextLevel = 100;
  while (remaining >= xpForNextLevel && level < 999) {
    remaining -= xpForNextLevel;
    level += 1;
    xpForNextLevel = 100 + (level - 1) * 50;
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel };
}

/* ------------------------------------------------------------------ */
/* Mocked datasets                                                     */
/* ------------------------------------------------------------------ */

const SAVINGS_GOALS = [
  { id: 'g1', title: 'Trip to Cartagena', target: 500, saved: 215, due: 'Dec 2026' },
  { id: 'g2', title: 'Emergency fund', target: 1000, saved: 320, due: 'Mar 2027' },
  { id: 'g3', title: 'New laptop', target: 1800, saved: 60, due: 'Aug 2027' },
];

/* ------------------------------------------------------------------ */
/* Sub-views                                                           */
/* ------------------------------------------------------------------ */

function StreakCalendar() {
  const { t } = useTranslation();
  const { data: streak, isLoading } = useProfileStreak();

  // Render the last 4 full weeks (28 days) ending today. 28 = 4×7, so each grid
  // column maps to a fixed weekday — letting us label headers from real dates.
  const { cells, labels, kept, total } = useMemo(() => {
    const active = new Set(streak?.days ?? []);
    const todayNumber = getDayNumber(Date.now());
    const start = todayNumber - 27;
    const cells = Array.from({ length: 28 }, (_, i) => {
      const dayNumber = start + i;
      return { dayNumber, kept: active.has(dayNumber), isToday: dayNumber === todayNumber };
    });
    const labels = Array.from({ length: 7 }, (_, c) => weekdayLetter(start + c));
    return { cells, labels, kept: cells.filter((c) => c.kept).length, total: cells.length };
  }, [streak?.days]);

  if (isLoading) return <PanelLoading />;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
        {labels.map((d, i) => (
          <span
            key={`label-${i}`}
            className="text-[10px] font-bold uppercase tracking-wider text-gray-400"
          >
            {d}
          </span>
        ))}
        {cells.map(({ dayNumber, kept, isToday }) => {
          if (kept) {
            return (
              <div
                key={dayNumber}
                className={`mx-auto h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center ${
                  isToday ? 'ring-2 ring-black ring-offset-1 ring-offset-white' : ''
                }`}
                aria-label={isToday ? t('profilePages.summary.todayStreakKept', 'Today — streak kept') : t('profilePages.summary.streakKept', 'Streak kept')}
              >
                <Image
                  src="/icons/global/streak.png"
                  alt=""
                  width={22}
                  height={22}
                  className="object-contain"
                />
              </div>
            );
          }
          return (
            <div
              key={dayNumber}
              className={`mx-auto h-9 w-9 rounded-full bg-black/5 flex items-center justify-center ${
                isToday ? 'ring-2 ring-black ring-offset-1 ring-offset-white' : ''
              }`}
              aria-label={isToday ? t('profilePages.summary.todayStreakMissed', 'Today — streak missed') : t('profilePages.summary.streakMissed', 'Streak missed')}
            >
              <span className="h-2 w-2 rounded-full bg-black/20" aria-hidden />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between rounded-xl bg-primary/10 border border-black/10 px-3 py-2">
        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
          {t('profilePages.summary.last4Weeks', 'Last 4 weeks')}
        </span>
        <span className="text-sm font-extrabold text-black tabular-nums">
          {t('profilePages.summary.keptOutOfDays', '{{kept}} / {{total}} days', { kept, total })}
        </span>
      </div>
    </div>
  );
}

function DepositsAreaChart() {
  const { t } = useTranslation();
  const { data, isLoading } = useDepositsComplete();
  const weekly = useMemo(() => buildWeeklyDeposits(data?.deposits ?? []), [data?.deposits]);

  // SVG viewBox is a convenient unitless canvas — we paint at 320×140 logical
  // units and let CSS scale it responsively via preserveAspectRatio="none".
  const W = 320;
  const H = 140;
  const PADDING_X = 16;
  const PADDING_TOP = 12;
  const PADDING_BOTTOM = 22;
  const innerW = W - PADDING_X * 2;
  const innerH = H - PADDING_TOP - PADDING_BOTTOM;
  const max = Math.max(...weekly.map((d) => d.amount)) || 1;
  const total = weekly.reduce((acc, d) => acc + d.amount, 0);

  const points = weekly.map((d, i) => {
    const x = PADDING_X + (innerW / (weekly.length - 1)) * i;
    const y = PADDING_TOP + innerH - (d.amount / max) * innerH;
    return { ...d, x, y };
  });

  // Smooth the polyline by inserting cubic-bezier control points midway between
  // each pair. This keeps the chart curvy without pulling in a charting lib.
  const linePath = points
    .map((p, i, arr) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = arr[i - 1];
      const cx = (prev.x + p.x) / 2;
      return `C ${cx} ${prev.y} ${cx} ${p.y} ${p.x} ${p.y}`;
    })
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${PADDING_TOP + innerH} L ${points[0].x} ${PADDING_TOP + innerH} Z`;

  // Three horizontal gridlines at 0 / 50% / max for a "real chart" feel.
  const gridYs = [PADDING_TOP, PADDING_TOP + innerH / 2, PADDING_TOP + innerH];

  if (isLoading) return <PanelLoading />;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-40"
          preserveAspectRatio="none"
          role="img"
          aria-label={t('profilePages.summary.depositsChartAria', 'Deposits over the last 6 weeks')}
        >
          <defs>
            <linearGradient id="depositsArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Gridlines */}
          {gridYs.map((y, i) => (
            <line
              key={i}
              x1={PADDING_X}
              x2={W - PADDING_X}
              y1={y}
              y2={y}
              stroke="rgba(0,0,0,0.08)"
              strokeDasharray={i === gridYs.length - 1 ? '0' : '3 3'}
            />
          ))}

          {/* Area + line, tinted via currentColor so it inherits the primary. */}
          <g className="text-primary">
            <path d={areaPath} fill="url(#depositsArea)" />
            <path
              d={linePath}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map((p) => (
              <g key={p.week}>
                <circle cx={p.x} cy={p.y} r={4} fill="white" stroke="black" strokeWidth={1.5} />
                <circle cx={p.x} cy={p.y} r={1.8} fill="black" />
              </g>
            ))}
          </g>

          {/* X-axis week labels (week-start date) */}
          {points.map((p) => (
            <text
              key={`label-${p.week}`}
              x={p.x}
              y={H - 6}
              textAnchor="middle"
              className="fill-gray-500"
              style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}
            >
              {p.week.toUpperCase()}
            </text>
          ))}
        </svg>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-primary/10 border border-black/10 px-3 py-2">
        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
          {t('profilePages.summary.last6Weeks', 'Last 6 weeks')}
        </span>
        <span className="text-sm font-extrabold text-black tabular-nums flex items-center gap-1.5">
          <FiTrendingUp className="h-3.5 w-3.5 text-emerald-600" />
          ${total.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
        </span>
      </div>
    </div>
  );
}

function XpProgress() {
  const { t } = useTranslation();
  const { data, isLoading } = useProfileExperience();
  const totalXp = Math.round(data?.experience ?? 0);
  const { level, xpIntoLevel, xpForNextLevel } = useMemo(() => deriveLevel(totalXp), [totalXp]);
  const pct = Math.min(100, (xpIntoLevel / xpForNextLevel) * 100);

  if (isLoading) return <PanelLoading />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-extrabold text-black tabular-nums">{t('profilePages.summary.levelShort', 'Lvl {{level}}', { level })}</span>
        <span className="text-[11px] font-semibold text-gray-500 tabular-nums">
          {xpIntoLevel} / {xpForNextLevel} XP
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-black/10 overflow-hidden border border-black/10">
        <div
          className="h-full bg-primary border-r-2 border-black/20"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs mt-1">
        <span className="text-gray-600">{t('profilePages.summary.totalExperience', 'Total experience')}</span>
        <span className="font-bold text-black tabular-nums">{totalXp.toLocaleString('en-US')} XP</span>
      </div>
    </div>
  );
}

function SavingsGoals() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      {SAVINGS_GOALS.map((g) => {
        const pct = Math.min(100, (g.saved / g.target) * 100);
        return (
          <div
            key={g.id}
            className="rounded-xl bg-primary/10 border border-black/10 p-3 flex flex-col gap-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-extrabold text-black truncate">
                {t(`profilePages.summary.goals.${g.id}.title`, g.title)}
              </span>
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">
                {t(`profilePages.summary.goals.${g.id}.due`, g.due)}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-black/10 overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold tabular-nums">
              <span className="text-black">${g.saved}</span>
              <span className="text-gray-500">${g.target}</span>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="mt-1 inline-flex items-center justify-center gap-2 h-11 rounded-md bg-white text-black border border-black border-b-3 text-xs font-bold uppercase tracking-wide hover:bg-white/80 hover:-translate-y-0.5 transition"
      >
        <FiPlus className="h-3.5 w-3.5" />
        {t('profilePages.summary.newGoal', 'New goal')}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function SummaryPage() {
  const { t } = useTranslation();
  return (
    <MockedSubPageLayout
      title={t('profilePages.summary.title', 'Your summary')}
      subtitle={t('profilePages.summary.subtitle', 'How your saving habit is shaping up.')}
      backHref="/profile"
      showSoonBadge={false}
    >
      <Panel
        icon="/icons/global/streak.png"
        title={t('profilePages.summary.streakHistory', 'Streak history')}
        subtitle={t('profilePages.summary.streakHistorySub', 'Days you kept the streak')}
      >
        <StreakCalendar />
      </Panel>

      <Panel
        icon="/icons/global/coin.png"
        title={t('profilePages.summary.depositsOverTime', 'Deposits over time')}
        subtitle={t('profilePages.summary.depositsOverTimeSub', 'Weekly contributions')}
      >
        <DepositsAreaChart />
      </Panel>

      <Panel
        icon="/icons/global/star.png"
        title={t('profilePages.summary.xpLevel', 'XP & level')}
        subtitle={t('profilePages.summary.xpLevelSub', 'Progress to your next level')}
      >
        <XpProgress />
      </Panel>

      <Panel
        icon="/icons/global/trophy.png"
        title={t('profilePages.summary.savingsGoals', 'Savings goals')}
        subtitle={t('profilePages.summary.savingsGoalsSub', "What you're working toward")}
        soon
      >
        <SavingsGoals />
      </Panel>
    </MockedSubPageLayout>
  );
}
