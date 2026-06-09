'use client';

import { ONE_DAY } from '@/core-ui/config/constants';
import { deriveLevel } from '@/core-ui/helpers';
import { useDepositsComplete } from '@/core-ui/hooks';
import { useProfileData, useProfileExperience, useProfileStreak } from '@/core-ui/hooks/profile';
import { DepositResponseDTO } from '@/core-ui/types';
import Image from 'next/image';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronLeft, FiChevronRight, FiTrendingUp } from 'react-icons/fi';
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
  /** Anchor id so other views (e.g. the streak modal) can deep-link to it. */
  id?: string;
  children: React.ReactNode;
}

/**
 * Cream panel with a global icon, a bolded title and an optional tagline.
 * Wraps every metric block so the page reads as a stack of "cards" without
 * needing a heavyweight chart library.
 */
function Panel({ icon, title, subtitle, soon, id, children }: PanelProps) {
  const { t } = useTranslation();
  return (
    <section
      id={id}
      className="rounded-2xl bg-white border border-black border-b-2 p-4 flex flex-col gap-3 scroll-mt-24"
    >
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

// Day-number for a UTC calendar date (year, 0-based month, day). Inverse of the
// midpoint convention used above: a UTC midnight maps to floor(ms/ONE_DAY)+1,
// matching getDayNumber for any instant strictly inside that day's window.
const dayNumberOfUTC = (year: number, month: number, day: number) =>
  Math.floor(Date.UTC(year, month, day) / ONE_DAY) + 1;

// Flatten a {year, month} pair into a comparable integer so we can clamp the
// calendar between the join month and the current month.
const monthIndex = (year: number, month: number) => year * 12 + month;

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

/* ------------------------------------------------------------------ */
/* Sub-views                                                           */
/* ------------------------------------------------------------------ */

function StreakCalendar() {
  const { t, i18n } = useTranslation();
  const { data: streak, isLoading } = useProfileStreak();
  const { data: profile } = useProfileData();

  const locale = i18n.language || 'en';

  // Calendar months are addressed in UTC so day-numbers line up with the
  // backend's UTC bucketing regardless of the viewer's timezone.
  const now = new Date();
  const currentIdx = monthIndex(now.getUTCFullYear(), now.getUTCMonth());

  // Earliest navigable month is the account creation month; default to the
  // current month while the profile is still loading or createdAt is unknown.
  const joinDate = profile?.createdAt ? new Date(profile.createdAt) : null;
  const joinValid = joinDate && !Number.isNaN(joinDate.getTime());
  const joinIdx = joinValid
    ? monthIndex(joinDate!.getUTCFullYear(), joinDate!.getUTCMonth())
    : currentIdx;

  // Cursor tracks the visible month; starts on the current month and is clamped
  // to [joinIdx, currentIdx] by the nav buttons below.
  const [cursor, setCursor] = useState(() => ({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth(),
  }));
  const cursorIdx = monthIndex(cursor.year, cursor.month);
  const canPrev = cursorIdx > joinIdx;
  const canNext = cursorIdx < currentIdx;

  const goPrev = () =>
    canPrev &&
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }));
  const goNext = () =>
    canNext &&
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }));

  // Monday-start weekday initials, localized. 2024-01-01 is a Monday.
  const weekdayLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
  }, [locale]);

  const monthTitle = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(Date.UTC(cursor.year, cursor.month, 1))
      ),
    [locale, cursor.year, cursor.month]
  );

  // Build the month grid: leading blanks for the first weekday offset
  // (Monday-start), then one cell per day with its streak/today/future state.
  const { cells, kept } = useMemo(() => {
    const active = new Set(streak?.days ?? []);
    const todayNumber = getDayNumber(Date.now());
    const joinNumber = joinValid
      ? dayNumberOfUTC(joinDate!.getUTCFullYear(), joinDate!.getUTCMonth(), joinDate!.getUTCDate())
      : -Infinity;

    const firstDow = (new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();

    const cells: Array<
      | { blank: true; key: string }
      | { blank: false; day: number; dayNumber: number; kept: boolean; isToday: boolean; muted: boolean }
    > = [];
    for (let i = 0; i < firstDow; i++) cells.push({ blank: true, key: `blank-${i}` });
    for (let day = 1; day <= daysInMonth; day++) {
      const dayNumber = dayNumberOfUTC(cursor.year, cursor.month, day);
      cells.push({
        blank: false,
        day,
        dayNumber,
        kept: active.has(dayNumber),
        isToday: dayNumber === todayNumber,
        muted: dayNumber > todayNumber || dayNumber < joinNumber,
      });
    }
    return { cells, kept: cells.filter((c) => !c.blank && c.kept).length };
  }, [streak?.days, cursor.year, cursor.month, joinValid, joinDate]);

  if (isLoading) return <PanelLoading />;

  return (
    <div className="flex flex-col gap-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canPrev}
          aria-label={t('profilePages.summary.prevMonth', 'Previous month')}
          className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-black/10 text-black hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <FiChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-extrabold text-black capitalize">{monthTitle}</span>
        <button
          type="button"
          onClick={goNext}
          disabled={!canNext}
          aria-label={t('profilePages.summary.nextMonth', 'Next month')}
          className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-black/10 text-black hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <FiChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
        {weekdayLabels.map((d, i) => (
          <span
            key={`label-${i}`}
            className="text-[10px] font-bold uppercase tracking-wider text-gray-400"
          >
            {d}
          </span>
        ))}
        {cells.map((cell) => {
          if (cell.blank) return <div key={cell.key} aria-hidden />;
          const { day, dayNumber, kept, isToday, muted } = cell;
          if (kept) {
            // Streak day: bold black number on a solid primary disc.
            // Same h-9 w-9 footprint as every other cell so numbers stay aligned.
            return (
              <div
                key={dayNumber}
                className={`mx-auto h-9 w-9 rounded-full flex items-center justify-center bg-primary ${
                  isToday ? 'ring-2 ring-black ring-offset-1 ring-offset-white' : ''
                }`}
                aria-label={
                  isToday
                    ? t('profilePages.summary.todayStreakKept', 'Today — streak kept')
                    : t('profilePages.summary.streakKept', 'Streak kept')
                }
              >
                <span className="text-xs font-extrabold text-black tabular-nums">{day}</span>
              </div>
            );
          }
          // Days without a streak get no disc — just the number. Past misses use
          // a readable dark gray; future / pre-join days stay faint.
          return (
            <div
              key={dayNumber}
              className={`mx-auto h-9 w-9 rounded-full flex items-center justify-center ${
                isToday ? 'ring-2 ring-black ring-offset-1 ring-offset-white' : ''
              }`}
              aria-label={
                isToday
                  ? t('profilePages.summary.todayStreakMissed', 'Today — streak missed')
                  : undefined
              }
            >
              <span
                className={`text-xs tabular-nums ${
                  muted ? 'font-medium text-gray-300' : 'font-semibold text-gray-700'
                }`}
              >
                {day}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between rounded-xl bg-primary/10 border border-black/10 px-3 py-2">
        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
          {t('profilePages.summary.streakDaysThisMonth', 'Streak days')}
        </span>
        <span className="text-sm font-extrabold text-black tabular-nums">{kept}</span>
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
        id="streak-history"
        icon="/icons/global/streak_face.png"
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
        id="xp-level"
        icon="/icons/global/star.png"
        title={t('profilePages.summary.xpLevel', 'XP & level')}
        subtitle={t('profilePages.summary.xpLevelSub', 'Progress to your next level')}
      >
        <XpProgress />
      </Panel>
    </MockedSubPageLayout>
  );
}
