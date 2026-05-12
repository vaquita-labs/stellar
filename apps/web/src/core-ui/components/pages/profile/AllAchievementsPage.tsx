'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { useMemo, useState } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { getDepositsData } from '../../../helpers/deposits';
import {
  useDepositsComplete,
  useProfileExperience,
  useProfileStreak,
} from '../../../hooks';
import { buildAchievements, buildMonthlyBadges, type Badge } from '../../../data/profile-badges';
import { useNetworkConfigStore } from '../../../stores';
import { AchievementDetail, AchievementModal } from './AchievementModal';
import { BadgeTile } from './BadgeTile';

type Tab = 'monthly' | 'achievements';

const TABS: { id: Tab; label: string }[] = [
  { id: 'monthly', label: 'Monthly badges' },
  { id: 'achievements', label: 'Achievements' },
];

function StatBar({ unlocked, total }: { unlocked: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((unlocked / total) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs font-bold text-gray-600 uppercase tracking-wider">
        <span>Unlocked</span>
        <span className="tabular-nums text-black">
          {unlocked} / {total}
        </span>
      </div>
      <div className="h-3 w-full bg-white border border-black rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function AllAchievementsPage() {
  const params = useSearchParams();
  const initialTab: Tab = params?.get('tab') === 'achievements' ? 'achievements' : 'monthly';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selected, setSelected] = useState<AchievementDetail | null>(null);

  const { walletAddress } = useNetworkConfigStore();
  const { data: streakData } = useProfileStreak();
  const { data: experienceData } = useProfileExperience();
  const { data: depositsData } = useDepositsComplete(walletAddress);

  const totalStreak = (streakData?.yesterdayStreak || 0) + (streakData?.todayStreak ? 1 : 0);
  const experience = experienceData?.experience ?? 0;
  const { activeDeposits } = getDepositsData(depositsData?.deposits ?? []);
  const totalDeposits = activeDeposits?.length ?? 0;

  const monthlyBadges = useMemo(buildMonthlyBadges, []);
  const achievements = useMemo(
    () => buildAchievements({ totalStreak, totalDeposits, experience }),
    [totalStreak, totalDeposits, experience]
  );

  const list: Badge[] = tab === 'monthly' ? monthlyBadges : achievements;
  const unlocked = list.filter((b) => b.unlocked).length;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-6 pb-16">
        {/* Header */}
        <header className="flex flex-col gap-4">
          <Link
            href="/profile"
            aria-label="Back"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:bg-white/80 transition"
          >
            <FiArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
            Your trophy room
          </h1>
          <p className="text-sm text-gray-600 -mt-2">
            Tap a badge to see how it was unlocked.
          </p>
        </header>

        {/* Tabs */}
        <div role="tablist" aria-label="Trophy categories" className="flex p-1 bg-white border border-black border-b-2 rounded-full">
          {TABS.map(({ id, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={`flex-1 h-10 px-3 rounded-full text-xs sm:text-sm font-extrabold uppercase tracking-wider transition ${
                  active
                    ? 'bg-primary text-black border border-black border-b-2'
                    : 'text-gray-500 hover:text-black bg-transparent'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Progress summary */}
        <div className="rounded-2xl border border-black border-b-2 bg-white p-4">
          <StatBar unlocked={unlocked} total={list.length} />
        </div>

        {/* Grid */}
        <div className="rounded-2xl border border-black border-b-2 bg-white p-4 sm:p-6">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 sm:gap-6 place-items-center">
            {list.map((badge) => (
              <BadgeTile
                key={badge.id}
                badge={badge}
                size="lg"
                showTitle
                onPress={() => setSelected(badge)}
              />
            ))}
          </div>
        </div>
      </div>

      <AchievementModal
        achievement={selected}
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
      />
    </div>
  );
}
