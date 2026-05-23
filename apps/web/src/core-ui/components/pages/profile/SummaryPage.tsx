'use client';

import Image from 'next/image';
import React from 'react';
import { FiPlus, FiTrendingUp } from 'react-icons/fi';
import { MockedSubPageLayout } from './MockedSubPageLayout';

/* ------------------------------------------------------------------ */
/* Shared shell                                                        */
/* ------------------------------------------------------------------ */

interface PanelProps {
  icon: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * Cream panel with a global icon, a bolded title and an optional tagline.
 * Wraps every metric block so the page reads as a stack of "cards" without
 * needing a heavyweight chart library.
 */
function Panel({ icon, title, subtitle, children }: PanelProps) {
  return (
    <section className="rounded-2xl bg-white border border-black border-b-2 p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2.5">
        <Image src={icon} alt={title} width={28} height={28} className="object-contain" />
        <div className="flex flex-col leading-tight">
          <h2 className="text-sm font-extrabold text-black">{title}</h2>
          {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Mocked datasets                                                     */
/* ------------------------------------------------------------------ */

// Duolingo-style streak calendar: each day is either "kept" (1) or "missed" (0).
// We render the last 4 full weeks ending today (28 days), with today marked.
// Replace with real per-day data once the backend exposes it.
const STREAK_DAYS: (0 | 1)[] = [
  1, 1, 0, 1, 1, 1, 1,
  1, 1, 1, 1, 0, 1, 1,
  1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1,
];
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Mock weekly deposits in USDC for the line chart. Replace with grouped real
// data (sum of deposit.amount bucketed by ISO week) when wiring backend. Labels
// use the week-start date so they make sense without context.
const DEPOSITS_BY_WEEK = [
  { week: 'Apr 7', amount: 25 },
  { week: 'Apr 14', amount: 45 },
  { week: 'Apr 21', amount: 30 },
  { week: 'Apr 28', amount: 80 },
  { week: 'May 5', amount: 60 },
  { week: 'May 12', amount: 110 },
];

const SAVINGS_GOALS = [
  { id: 'g1', title: 'Trip to Cartagena', target: 500, saved: 215, due: 'Dec 2026' },
  { id: 'g2', title: 'Emergency fund', target: 1000, saved: 320, due: 'Mar 2027' },
  { id: 'g3', title: 'New laptop', target: 1800, saved: 60, due: 'Aug 2027' },
];

/* ------------------------------------------------------------------ */
/* Sub-views                                                           */
/* ------------------------------------------------------------------ */

function StreakCalendar() {
  // "Today" is the very last cell (index 27 in a 28-day window).
  const todayIndex = STREAK_DAYS.length - 1;
  const kept = STREAK_DAYS.filter((d) => d === 1).length;
  const total = STREAK_DAYS.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
        {DAY_LABELS.map((d, i) => (
          <span
            key={`label-${i}`}
            className="text-[10px] font-bold uppercase tracking-wider text-gray-400"
          >
            {d}
          </span>
        ))}
        {STREAK_DAYS.map((day, i) => {
          const isToday = i === todayIndex;
          if (day) {
            return (
              <div
                key={i}
                className={`mx-auto h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center ${
                  isToday ? 'ring-2 ring-black ring-offset-1 ring-offset-white' : ''
                }`}
                aria-label={isToday ? 'Today — streak kept' : 'Streak kept'}
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
              key={i}
              className={`mx-auto h-9 w-9 rounded-full bg-black/5 flex items-center justify-center ${
                isToday ? 'ring-2 ring-black ring-offset-1 ring-offset-white' : ''
              }`}
              aria-label={isToday ? 'Today — streak missed' : 'Streak missed'}
            >
              <span className="h-2 w-2 rounded-full bg-black/20" aria-hidden />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between rounded-xl bg-primary/10 border border-black/10 px-3 py-2">
        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
          Last 4 weeks
        </span>
        <span className="text-sm font-extrabold text-black tabular-nums">
          {kept} / {total} days
        </span>
      </div>
    </div>
  );
}

function DepositsAreaChart() {
  // SVG viewBox is a convenient unitless canvas — we paint at 320×140 logical
  // units and let CSS scale it responsively via preserveAspectRatio="none".
  const W = 320;
  const H = 140;
  const PADDING_X = 16;
  const PADDING_TOP = 12;
  const PADDING_BOTTOM = 22;
  const innerW = W - PADDING_X * 2;
  const innerH = H - PADDING_TOP - PADDING_BOTTOM;
  const max = Math.max(...DEPOSITS_BY_WEEK.map((d) => d.amount));
  const total = DEPOSITS_BY_WEEK.reduce((acc, d) => acc + d.amount, 0);

  const points = DEPOSITS_BY_WEEK.map((d, i) => {
    const x = PADDING_X + (innerW / (DEPOSITS_BY_WEEK.length - 1)) * i;
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

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-40"
          preserveAspectRatio="none"
          role="img"
          aria-label="Deposits over the last 6 weeks"
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
          Last 6 weeks
        </span>
        <span className="text-sm font-extrabold text-black tabular-nums flex items-center gap-1.5">
          <FiTrendingUp className="h-3.5 w-3.5 text-emerald-600" />
          ${total} USDC
        </span>
      </div>
    </div>
  );
}

function XpProgress() {
  // Mocked numbers — replace with real experience/level once the backend lands.
  const level = 3;
  const xp = 240;
  const xpForNextLevel = 500;
  const pct = Math.min(100, (xp / xpForNextLevel) * 100);
  const breakdown = [
    { label: 'Daily streak', value: 80 },
    { label: 'Deposits', value: 110 },
    { label: 'Achievements', value: 50 },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-extrabold text-black tabular-nums">Lvl {level}</span>
        <span className="text-[11px] font-semibold text-gray-500 tabular-nums">
          {xp} / {xpForNextLevel} XP
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-black/10 overflow-hidden border border-black/10">
        <div
          className="h-full bg-primary border-r-2 border-black/20"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="flex flex-col gap-1.5 mt-1">
        {breakdown.map((b) => (
          <li key={b.label} className="flex items-center justify-between text-xs">
            <span className="text-gray-600">{b.label}</span>
            <span className="font-bold text-black tabular-nums">+{b.value} XP</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SavingsGoals() {
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
              <span className="text-sm font-extrabold text-black truncate">{g.title}</span>
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">{g.due}</span>
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
        New goal
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function SummaryPage() {
  return (
    <MockedSubPageLayout
      title="Your summary"
      subtitle="How your saving habit is shaping up. Numbers below are placeholders for now."
      backHref="/profile"
    >
      <Panel
        icon="/icons/global/streak.png"
        title="Streak history"
        subtitle="Days you kept the streak"
      >
        <StreakCalendar />
      </Panel>

      <Panel
        icon="/icons/global/coin.png"
        title="Deposits over time"
        subtitle="Weekly contributions"
      >
        <DepositsAreaChart />
      </Panel>

      <Panel
        icon="/icons/global/trophy.png"
        title="XP & level"
        subtitle="Progress to your next level"
      >
        <XpProgress />
      </Panel>

      <Panel
        icon="/icons/global/star.png"
        title="Savings goals"
        subtitle="What you're working toward"
      >
        <SavingsGoals />
      </Panel>
    </MockedSubPageLayout>
  );
}
